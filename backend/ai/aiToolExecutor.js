/**
 * backend/ai/aiToolExecutor.js
 * ─────────────────────────────────────────────────────────────────
 * Secure execution engine for OpenAI tool/function calls.
 * Authoritative boundary: Validates parameters, executes domain operations,
 * logs immutable audit entries in ai_admin_actions, and returns structured data.
 */

const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const artisanService = require('../services/artisanService');
const productService = require('../services/productService');
const whatsappService = require('../services/whatsappService');
const complaintService = require('../services/complaintService');
const analyticsReportService = require('../services/analyticsReportService');
const { broadcastSync } = require('../utils/realtime');
const agentHealthService = require('../services/agentHealthService');
const agentApprovalService = require('../services/agentApprovalService');
const marketingService = require('../services/marketingService');
const recommendationService = require('../services/recommendationService');
const shippingService = require('../services/shipping/shippingService');

const { v4: uuidv4 } = require('uuid');

let inMemoryAuditLogs = [];
let inMemoryRules = {
  artisan_auto_verification: true,
  product_auto_approval: true,
  order_auto_processing: true,
  inventory_monitoring: true,
  review_moderation: true,
  daily_ai_report: true,
  whatsapp_notifications: true,
};

/**
 * Persist an immutable record in ai_admin_actions.
 */
async function recordAuditAction({
  conversationId,
  eventType = 'TOOL_CALL',
  entityType,
  entityId,
  actionName,
  toolName,
  inputSummary,
  decision,
  reason,
  confidence = 1.0,
  result,
  status = 'success',
  error = null,
}) {
  const auditEntry = {
    id: uuidv4(),
    conversation_id: conversationId || null,
    event_type: eventType,
    entity_type: entityType || null,
    entity_id: String(entityId || ''),
    action_name: actionName,
    tool_name: toolName,
    input_summary: typeof inputSummary === 'string' ? inputSummary : JSON.stringify(inputSummary || {}),
    decision: decision || actionName,
    reason: reason || null,
    confidence: Number(confidence) || 1.0,
    result: result || {},
    status,
    error: error || null,
    created_at: new Date().toISOString(),
  };

  try {
    const { error: insertErr } = await safeQuery(() =>
      supabase.from('ai_admin_actions').insert([auditEntry])
    );
    if (!insertErr) return auditEntry;
  } catch (err) {}

  inMemoryAuditLogs.unshift(auditEntry);
  if (inMemoryAuditLogs.length > 200) inMemoryAuditLogs.pop();
  return auditEntry;
}

const SAFETY_LEVELS = {
  // LEVEL 1: Safe / Read-only / Analysis
  get_artisans: 1,
  get_pending_artisans: 1,
  get_artisan_details: 1,
  get_products: 1,
  get_pending_products: 1,
  get_low_stock_products: 1,
  get_orders: 1,
  get_order_details: 1,
  get_failed_payments: 1,
  get_reviews: 1,
  get_complaints: 1,
  get_business_analytics: 1,
  get_ai_queue_status: 1,
  get_automation_rules: 1,
  get_recent_ai_actions: 1,
  get_suspicious_orders: 1,
  analyze_order_risk: 1,
  generate_daily_business_report: 1,
  // New Level 1 tools
  get_system_health: 1,
  get_recent_errors: 1,
  get_seasonal_context: 1,
  suggest_seasonal_products: 1,
  generate_product_recommendations: 1,
  analyze_seasonal_inventory: 1,
  get_shipping_status: 1,
  detect_delayed_shipments: 1,
  check_shipping_serviceability: 1,
  get_shipping_rates: 1,
  calculate_shipping_rate: 1,
  get_shipment: 1,
  track_shipment: 1,
  get_shipping_statistics: 1,
  generate_shipping_label: 1,
  generate_shipping_invoice: 1,
  get_pending_approvals: 1,
  get_agent_memory: 1,
  get_hero_banners: 1,
  // AI content generation (read-like, no side effects)
  generate_product_description: 1,
  generate_ad_copy: 1,
  generate_social_content: 1,

  // LEVEL 2: Controlled Operational Actions (Autonomous with audit log)
  create_shiprocket_order: 2,
  confirm_cod_collection: 2,
  assign_awb: 2,
  schedule_pickup: 2,
  retry_failed_shipment: 2,
  verify_artisan: 2,
  batch_verify_artisans: 2,
  hold_artisan: 2,
  approve_product: 2,
  batch_approve_products: 2,
  update_product_details: 2,
  hold_product: 2,
  confirm_order: 2,
  hold_order: 2,
  send_artisan_whatsapp: 2,
  moderate_review: 2,
  approve_review: 2,
  batch_approve_reviews: 2,
  resolve_complaint: 2,
  update_automation_rule: 2,
  create_approval_request: 2,
  create_hero_banner_approval: 2,
  add_hero_banner: 2,
  remove_hero_banner: 2,
  update_discount_banner: 2,
  launch_festival_campaign: 2,
  update_site_settings: 2,
  // Marketing campaigns
  generate_marketing_campaign: 2,

  // LEVEL 3: High Risk (Strict human admin confirmation required)
  reject_artisan: 3,
  reject_product: 3,
  cancel_order: 3,
  update_product_inventory: 3,
  update_hero_banners: 3,
};

/**
 * Execute a structured tool call requested by OpenAI/Gemini.
 *
 * @param {string} toolName - Name of the function to invoke
 * @param {object} args - Parsed arguments from AI
 * @param {object} context - Execution context { conversationId, adminId, eventType }
 * @returns {Promise<object>} Structured result returned back to AI
 */
async function executeTool(toolName, args = {}, context = {}) {
  const { conversationId, adminId, eventType = 'AI_OPERATIONS' } = context;

  console.log(`🤖 [AI Tool Executor] Executing tool: ${toolName}`, args);

  try {
    let result = null;
    let entityType = null;
    let entityId = null;
    let decision = 'executed';
    let reason = args.reason || null;
    let confidence = args.confidence || 1.0;

    const safetyLevel = SAFETY_LEVELS[toolName] || 1;

    // Safety Level 3 Guard: Require explicit confirmation only for background autonomous jobs,
    // NEVER block direct directives explicitly issued by the authenticated administrator in chat.
    if (safetyLevel === 3 && !args.admin_confirmed && eventType !== 'ADMIN_CHAT_DIRECTIVE') {
      const confirmationToken = uuidv4();
      const warningSummary = `High-risk action [${toolName}] requires explicit administrative authorization.`;
      console.warn(`🛡️ [AI Safety Guard] Intercepted Level 3 High-Risk action: ${toolName}.`);

      const audit = await recordAuditAction({
        conversationId,
        eventType,
        actionName: toolName,
        toolName,
        inputSummary: args,
        decision: 'requires_admin_confirmation',
        reason: args.reason || 'Level 3 High-Risk action requiring admin review',
        status: 'pending_confirmation',
        confidence,
        result: { requires_admin_confirmation: true, confirmation_token: confirmationToken },
      });

      return {
        requires_admin_confirmation: true,
        safety_level: 3,
        tool_name: toolName,
        action_summary: warningSummary,
        confirmation_token: confirmationToken,
        parameters: args,
        audit_id: audit.id,
        message: `Action '${toolName}' is classified as Level 3 (High-Risk). Operation paused pending human admin confirmation.`,
      };
    }

    switch (toolName) {
      // ─── SYSTEM HEALTH TOOLS ────────────────────────────────────────
      case 'get_system_health':
        result = await agentHealthService.checkSystemHealth();
        break;

      case 'get_recent_errors': {
        const errData = await agentHealthService.getRecentErrors(args.limit || 10);
        result = errData;
        break;
      }

      // ─── MARKETING TOOLS ─────────────────────────────────────────────
      case 'generate_marketing_campaign': {
        // Fetch relevant products first
        const { data: marketingProducts } = await safeQuery(() =>
          supabase
            .from('products')
            .select('id, name, price, category, description, image_url')
            .eq('is_in_stock', true)
            .eq('status', 'approved')
            .ilike('category', args.category ? `%${args.category}%` : '%')
            .limit(12)
        );
        const campaignResult = await marketingService.generateCampaign({
          theme: args.theme,
          products: marketingProducts || [],
          audience: args.audience || 'handmade craft enthusiasts',
          platform: args.platform || 'Social Media',
        });

        // ✅ AUTO-CREATE approval record so admin sees it immediately in the Approvals tab
        // This runs regardless of whether the AI calls create_approval_request separately
        let approvalRecord = null;
        try {
          approvalRecord = await agentApprovalService.createApproval({
            toolName: 'generate_marketing_campaign',
            toolArgs: {
              theme: args.theme,
              platform: args.platform || 'Social Media',
              audience: args.audience || 'handmade craft enthusiasts',
              category: args.category || null,
              campaignContentPreview: (campaignResult.campaign || '').substring(0, 300) + '...',
            },
            description: `Review and approve the AI-generated "${args.theme}" marketing campaign for ${args.platform || 'Social Media'} before publishing. Content has been generated and is ready for your review.`,
            riskLevel: 'HIGH',
            adminId: adminId || null,
            conversationId,
          });
        } catch (approvalErr) {
          console.warn('⚠️ [AI Tool Executor] Could not auto-create approval record:', approvalErr.message);
        }

        result = {
          ...campaignResult,
          requiresApproval: true,
          approvalId: approvalRecord?.id || null,
          approvalStatus: 'PENDING',
          approvalMessage: approvalRecord
            ? `✅ Approval request created (ID: ${approvalRecord.id}). Go to the **Approvals tab** in AI Operations Manager to review and approve this campaign before publishing.`
            : '⚠️ Campaign generated. Please review before publishing. Note: approval record could not be auto-created — run the database migration SQL first.',
        };
        decision = 'approval_auto_created';
        break;
      }


      case 'generate_ad_copy': {
        entityType = 'product';
        entityId = args.product_id;
        const { data: adProduct } = await safeQuery(() =>
          supabase.from('products').select('id, name, price, category, description, material, tags, artisan_id').eq('id', args.product_id).single()
        );
        if (!adProduct) throw new Error(`Product ${args.product_id} not found`);
        result = await marketingService.generateAdCopy(adProduct, args.format || 'medium');
        break;
      }

      case 'generate_product_description': {
        entityType = 'product';
        entityId = args.product_id;
        const { data: descProduct } = await safeQuery(() =>
          supabase.from('products').select('id, name, price, category, description, material, tags, artisan_id').eq('id', args.product_id).single()
        );
        if (!descProduct) throw new Error(`Product ${args.product_id} not found`);
        result = await marketingService.generateProductDescription(descProduct);
        break;
      }

      case 'generate_social_content': {
        let socialProducts = [];
        if (args.category) {
          const { data } = await safeQuery(() =>
            supabase.from('products').select('id, name, price, category').eq('is_in_stock', true).ilike('category', `%${args.category}%`).limit(6)
          );
          socialProducts = data || [];
        }
        result = await marketingService.generateSocialContent(socialProducts, args.occasion || 'general');
        break;
      }

      // ─── RECOMMENDATION TOOLS ─────────────────────────────────────────
      case 'get_seasonal_context':
        result = recommendationService.getSeasonalContext();
        break;

      case 'suggest_seasonal_products':
        result = await recommendationService.generateSeasonalRecommendations({ limit: args.limit || 12 });
        break;

      case 'generate_product_recommendations':
        result = await recommendationService.getProductRecommendationsByCategory({ category: args.category, limit: args.limit || 10 });
        break;

      case 'analyze_seasonal_inventory':
        result = await recommendationService.analyzeSeasonalInventory();
        break;


      // ─── HERO & STOREFRONT BANNER TOOLS ─────────────────────────────
      case 'get_hero_banners': {
        const { readSettings } = require('../controllers/settingsController');
        const currentSettings = readSettings();
        result = {
          heroSlides: currentSettings.heroSlides || [],
          discountBanner: currentSettings.discountBanner || null,
          totalSlides: (currentSettings.heroSlides || []).length,
        };
        break;
      }

      case 'add_hero_banner': {
        entityType = 'hero_banner';
        const festiveImages = {
          ganesh: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047566/kalastyle-artisan-marketplace/xtzypfezplersfalej58.jpg',
          diwali: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048918/kalastyle-artisan-marketplace/jkjs1hgqonmbq9h3eizd.jpg',
          textile: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg',
          wood: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047399/kalastyle-artisan-marketplace/m4z3g3pnrgfwpaixwlbg.jpg',
        };

        const themeStr = (args.theme || args.headline || '').toLowerCase();
        let selectedImage = args.image;
        if (!selectedImage) {
          if (themeStr.includes('ganesh')) selectedImage = festiveImages.ganesh;
          else if (themeStr.includes('diwali')) selectedImage = festiveImages.diwali;
          else if (themeStr.includes('handloom') || themeStr.includes('textile')) selectedImage = festiveImages.textile;
          else if (themeStr.includes('wood')) selectedImage = festiveImages.wood;
          else selectedImage = festiveImages.ganesh;
        }

        const newSlide = {
          id: Date.now(),
          image: selectedImage,
          badgeText: args.badgeText || (args.theme ? `✦ ${args.theme} Special` : '✦ Festive Special'),
          badgeType: 'sale',
          headline: args.headline,
          subtitle: args.subtitle,
          buttonText: args.buttonText || 'Explore Festive Crafts',
          buttonLink: args.buttonLink || '/products',
          align: args.align || 'center',
        };

        const { readSettings, applySettingsUpdate } = require('../controllers/settingsController');
        const current = readSettings();
        const existingSlides = Array.isArray(current.heroSlides) ? [...current.heroSlides] : [];
        const updatedSlides = [newSlide, ...existingSlides];

        await applySettingsUpdate({ heroSlides: updatedSlides });

        result = {
          success: true,
          liveOnWebsite: true,
          action: 'HERO_BANNER_PUBLISHED_LIVE',
          banner: newSlide,
          totalSlides: updatedSlides.length,
          homepageUrl: '/',
          message: `✅ Hero banner "${newSlide.headline}" has been published LIVE to the homepage! Visitors see it on the hero slider immediately.`,
        };
        decision = 'hero_banner_published_live';
        break;
      }

      case 'remove_hero_banner': {
        entityType = 'hero_banner';
        const { applySettingsUpdate, readSettings } = require('../controllers/settingsController');
        const current = readSettings();
        let slides = Array.isArray(current.heroSlides) ? [...current.heroSlides] : [];
        const initialCount = slides.length;

        if (args.headline) {
          const match = args.headline.toLowerCase();
          slides = slides.filter(s => !s.headline?.toLowerCase().includes(match));
        } else if (args.slide_id) {
          slides = slides.filter(s => String(s.id) !== String(args.slide_id));
        } else if (slides.length > 1) {
          slides.shift();
        }

        if (slides.length === 0) {
          throw new Error('Cannot remove all hero slides. At least one hero slide must remain.');
        }

        await applySettingsUpdate({ heroSlides: slides });

        result = {
          success: true,
          liveOnWebsite: true,
          action: 'HERO_BANNER_REMOVED',
          removedCount: initialCount - slides.length,
          remainingSlides: slides.length,
          message: `Hero banner removed from the live homepage.`,
        };
        break;
      }

      case 'update_discount_banner': {
        entityType = 'discount_banner';
        const { applySettingsUpdate, readSettings } = require('../controllers/settingsController');
        const current = readSettings();
        const currentBanner = current.discountBanner || {};

        const updatedBanner = {
          ...currentBanner,
          title: args.title || currentBanner.title,
          description: args.description || currentBanner.description,
          discount: args.discount || currentBanner.discount,
          code: args.code || currentBanner.code,
          discountPercentage: args.discountPercentage !== undefined ? args.discountPercentage : currentBanner.discountPercentage,
          buttonText: args.buttonText || currentBanner.buttonText,
          buttonLink: args.buttonLink || currentBanner.buttonLink,
          isActive: args.isActive !== undefined ? Boolean(args.isActive) : true,
        };

        await applySettingsUpdate({ discountBanner: updatedBanner });

        result = {
          success: true,
          liveOnWebsite: true,
          action: 'DISCOUNT_BANNER_UPDATED_LIVE',
          banner: updatedBanner,
          message: `✅ Top promotional discount banner updated LIVE across the website: "${updatedBanner.title}" (${updatedBanner.discount} off with code ${updatedBanner.code}).`,
        };
        decision = 'discount_banner_updated_live';
        break;
      }

      case 'launch_festival_campaign': {
        entityType = 'campaign';
        const { applySettingsUpdate, readSettings } = require('../controllers/settingsController');
        const current = readSettings();

        const festiveImages = {
          ganesh: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047566/kalastyle-artisan-marketplace/xtzypfezplersfalej58.jpg',
          diwali: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048918/kalastyle-artisan-marketplace/jkjs1hgqonmbq9h3eizd.jpg',
          textile: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg',
          wood: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047399/kalastyle-artisan-marketplace/m4z3g3pnrgfwpaixwlbg.jpg',
        };
        const themeLower = (args.theme || '').toLowerCase();
        let bgImg = args.image;
        if (!bgImg) {
          if (themeLower.includes('ganesh')) bgImg = festiveImages.ganesh;
          else if (themeLower.includes('diwali')) bgImg = festiveImages.diwali;
          else if (themeLower.includes('handloom')) bgImg = festiveImages.textile;
          else bgImg = festiveImages.ganesh;
        }

        const newSlide = {
          id: Date.now(),
          image: bgImg,
          badgeText: args.badgeText || `✦ ${args.theme} Utsav Special`,
          badgeType: 'sale',
          headline: args.headline || `${args.theme} Festival Celebration`,
          subtitle: args.subtitle || `Celebrate ${args.theme} with authentic handcrafted creations directly from generational Indian artisans.`,
          buttonText: 'Shop Festive Crafts',
          buttonLink: args.category ? `/products?category=${encodeURIComponent(args.category)}` : '/products',
          align: 'center',
        };

        const existingSlides = Array.isArray(current.heroSlides) ? [...current.heroSlides] : [];
        const updatedSlides = [newSlide, ...existingSlides];

        const discCode = args.code || (args.theme ? args.theme.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) + '30' : 'KALA30');
        const discText = args.discount || '30%';
        const updatedDiscountBanner = {
          title: `${args.theme} Special Sale`,
          description: `Use code ${discCode} to get up to ${discText} OFF on handcrafted heritage products`,
          discount: discText,
          code: discCode,
          discountPercentage: parseInt(discText, 10) || 30,
          buttonText: 'Claim Deal',
          buttonLink: '/products',
          isActive: true,
        };

        await applySettingsUpdate({
          heroSlides: updatedSlides,
          discountBanner: updatedDiscountBanner,
        });

        const { data: featuredProducts } = await safeQuery(() =>
          supabase.from('products').select('id, name, price, category, image_url').eq('is_in_stock', true).limit(6)
        );

        result = {
          success: true,
          liveOnWebsite: true,
          action: 'CAMPAIGN_LAUNCHED_LIVE',
          theme: args.theme,
          heroSlide: newSlide,
          discountBanner: updatedDiscountBanner,
          featuredProductsCount: (featuredProducts || []).length,
          message: `🎉 The complete "${args.theme}" campaign has been LAUNCHED LIVE on the website! The hero banner is active on the homepage, and the promo discount banner with code "${discCode}" is active across all pages.`,
        };
        decision = 'campaign_launched_live';
        break;
      }

      case 'update_site_settings': {
        entityType = 'settings';
        const { applySettingsUpdate } = require('../controllers/settingsController');
        const updated = await applySettingsUpdate(args);
        result = {
          success: true,
          liveOnWebsite: true,
          action: 'SITE_SETTINGS_UPDATED_LIVE',
          settings: updated,
          message: `✅ Site settings updated LIVE across the website!`,
        };
        break;
      }

      case 'create_hero_banner_approval': {
        entityType = 'hero_banner';
        const festiveImages = {
          ganesh: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047566/kalastyle-artisan-marketplace/xtzypfezplersfalej58.jpg',
          diwali: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048918/kalastyle-artisan-marketplace/jkjs1hgqonmbq9h3eizd.jpg',
          textile: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg',
          wood: 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789047399/kalastyle-artisan-marketplace/m4z3g3pnrgfwpaixwlbg.jpg',
        };

        const themeStr = (args.theme || args.headline || '').toLowerCase();
        let selectedImage = args.image;
        if (!selectedImage) {
          if (themeStr.includes('ganesh')) selectedImage = festiveImages.ganesh;
          else if (themeStr.includes('diwali')) selectedImage = festiveImages.diwali;
          else if (themeStr.includes('handloom') || themeStr.includes('textile')) selectedImage = festiveImages.textile;
          else selectedImage = festiveImages.ganesh;
        }

        const bannerSlide = {
          headline: args.headline,
          subtitle: args.subtitle,
          badgeText: args.badgeText || (args.theme ? `✦ ${args.theme} Special` : '✦ Festive Special'),
          badgeType: 'sale',
          buttonText: args.buttonText || 'Explore Festive Crafts',
          buttonLink: args.buttonLink || '/products',
          image: selectedImage,
          align: args.align || 'center',
          theme: args.theme || 'Festival',
        };

        const approval = await agentApprovalService.createApproval({
          toolName: 'add_hero_slide',
          toolArgs: bannerSlide,
          description: `Add Homepage Hero Banner for ${args.theme || 'Festival'}: "${args.headline}"`,
          riskLevel: 'HIGH',
          adminId: adminId || null,
          conversationId,
        });

        result = {
          success: true,
          approvalId: approval.id,
          status: 'PENDING',
          bannerProposed: bannerSlide,
          message: `✅ Approval request created successfully (ID: ${approval.id}). Go to the **Approvals tab** in the AI Operations Manager to view and click **✓ Approve** to publish this banner live to the homepage!`,
        };
        decision = 'approval_requested';
        break;
      }

      case 'update_hero_banners': {
        entityType = 'hero_banner';
        const { applySettingsUpdate } = require('../controllers/settingsController');
        const updated = await applySettingsUpdate({ heroSlides: args.slides });
        result = {
          success: true,
          slides: updated.heroSlides,
          message: `Updated homepage hero banners successfully.`,
        };
        break;
      }

      // ─── APPROVAL MANAGEMENT TOOLS ───────────────────────────────────
      case 'get_pending_approvals':
        result = await agentApprovalService.getPendingApprovals();
        break;

      case 'create_approval_request': {
        entityType = 'approval';
        const approval = await agentApprovalService.createApproval({
          toolName: args.tool_name,
          toolArgs: args.tool_args || {},
          description: args.description,
          riskLevel: args.risk_level || 'HIGH',
          adminId: adminId || null,
          conversationId,
        });
        result = {
          success: true,
          approval,
          message: `Approval request created for action "${args.tool_name}". An admin must approve this before execution.`,
        };
        decision = 'approval_requested';
        break;
      }

      // ─── AGENT MEMORY ────────────────────────────────────────────────
      case 'get_agent_memory': {
        let memQuery = supabase.from('ai_agent_memory').select('id, memory_type, key, description, updated_at');
        if (args.memory_type && args.memory_type !== 'all') {
          memQuery = memQuery.eq('memory_type', args.memory_type);
        }
        const { data: memData } = await safeQuery(() => memQuery.limit(50));
        result = { memory: memData || [], count: (memData || []).length };
        break;
      }

      // ─── READ TOOLS ────────────────────────────────────────────────
      case 'get_artisans':
        result = await artisanService.getArtisans(args);
        break;

      case 'get_pending_artisans':
        result = await artisanService.getPendingArtisans(args.limit);
        break;

      case 'get_artisan_details':
        entityType = 'artisan';
        entityId = args.artisan_id;
        result = await artisanService.getArtisanDetails(args.artisan_id);
        break;

      case 'get_products':
        result = await productService.getProducts(args);
        break;

      case 'get_pending_products':
        result = await productService.getPendingProducts(args.limit);
        break;

      case 'get_low_stock_products':
        result = await productService.getLowStockProducts(args.threshold, args.limit);
        break;

      case 'get_orders': {
        let query = supabase
          .from('orders')
          .select('*, users(name, email, phone)')
          .order('created_at', { ascending: false })
          .limit(Math.min(args.limit || 20, 50));

        if (args.status && args.status !== 'all') query = query.eq('status', args.status);
        if (args.payment_status && args.payment_status !== 'all') query = query.eq('payment_status', args.payment_status);

        const { data, error } = await safeQuery(() => query);
        if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
        result = data || [];
        break;
      }

      case 'get_order_details': {
        entityType = 'order';
        entityId = args.order_id;
        const { data: order, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .select('*, users(name, email, phone), order_items(*, products(name, price, image_url)), artisan_orders(*, artisan_profiles(store_name))')
            .eq('id', args.order_id)
            .single()
        );
        if (error || !order) throw new Error(`Order not found: ${args.order_id}`);
        result = order;
        break;
      }

      case 'get_failed_payments': {
        const { data, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .select('id, order_number, user_id, total_price, payment_method, payment_status, status, created_at, users(name, email, phone)')
            .or('payment_status.eq.failed,status.eq.payment_failed')
            .order('created_at', { ascending: false })
            .limit(Math.min(args.limit || 20, 50))
        );
        if (error) throw new Error(`Failed to fetch failed payments: ${error.message}`);
        result = data || [];
        break;
      }

      case 'get_reviews': {
        let query = supabase
          .from('reviews')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(Math.min(args.limit || 20, 50));

        if (typeof args.is_approved === 'boolean') {
          query = query.eq('is_approved', args.is_approved);
        }

        const { data, error } = await safeQuery(() => query);
        if (error && error.code !== '42P01') throw error;
        result = data || [];
        break;
      }

      case 'get_complaints':
        result = await complaintService.getComplaints(args);
        break;

      case 'get_business_analytics':
        result = await analyticsReportService.getBusinessAnalytics(args.period || 'today');
        break;

      case 'get_ai_queue_status': {
        const { data, error } = await safeQuery(() =>
          supabase
            .from('ai_action_queue')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20)
        );
        result = {
          jobs: data || [],
          pendingCount: (data || []).filter(j => j.status === 'pending').length,
          processingCount: (data || []).filter(j => j.status === 'processing').length,
          failedCount: (data || []).filter(j => j.status === 'failed' || j.status === 'dead_letter').length,
        };
        break;
      }

      case 'get_automation_rules': {
        const { data, error } = await safeQuery(() =>
          supabase.from('ai_automation_rules').select('*')
        );
        if (!error && data && data.length > 0) {
          result = data;
        } else {
          result = Object.entries(inMemoryRules).map(([id, is_enabled]) => ({
            id,
            is_enabled,
            name: id.replace(/_/g, ' ').toUpperCase(),
          }));
        }
        break;
      }

      case 'get_recent_ai_actions': {
        const { data, error } = await safeQuery(() =>
          supabase
            .from('ai_admin_actions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(args.limit || 20, 50))
        );
        result = !error && data && data.length > 0 ? data : inMemoryAuditLogs.slice(0, args.limit || 20);
        break;
      }

      case 'get_suspicious_orders': {
        const suspiciousService = require('../services/suspiciousOrderService');
        const flaggedOrders = await suspiciousService.getSuspiciousOrders({
          status: args.status || 'all',
          limit: args.limit || 20,
        });
        result = {
          total: flaggedOrders.length,
          orders: flaggedOrders,
        };
        break;
      }

      case 'analyze_order_risk': {
        const suspiciousService = require('../services/suspiciousOrderService');
        let orderQuery = supabase.from('orders').select('*');
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.order_id)) {
          orderQuery = orderQuery.eq('id', args.order_id);
        } else {
          orderQuery = orderQuery.eq('order_number', args.order_id);
        }
        const { data: targetOrder } = await orderQuery.maybeSingle();
        if (!targetOrder) {
          result = { error: `Order ${args.order_id} not found for risk analysis` };
        } else {
          const evalResult = await suspiciousService.evaluateOrderRisk(targetOrder);
          await supabase.from('orders').update({
            risk_status: evalResult.riskStatus,
            risk_score: evalResult.riskScore,
            risk_reasons: evalResult.reasons,
            updated_at: new Date().toISOString(),
          }).eq('id', targetOrder.id);

          result = {
            order_id: targetOrder.id,
            order_number: targetOrder.order_number,
            risk_status: evalResult.riskStatus,
            risk_score: evalResult.riskScore,
            risk_reasons: evalResult.reasons,
            recommended_action: evalResult.recommendedAction,
          };
        }
        break;
      }

      // ─── SHIPROCKET SHIPPING & LOGISTICS TOOLS ─────────────────────
      case 'check_shipping_serviceability':
        result = await shippingService.checkServiceability(args);
        break;

      case 'get_shipping_rates':
      case 'calculate_shipping_rate':
        result = await shippingService.getShippingRates(args);
        break;

      case 'create_shiprocket_order': {
        entityType = 'shipment';
        decision = 'create_shipment';
        let resolvedOrderId = args.order_id;
        let targetOrder = null;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.order_id)) {
          const { data: oByNum } = await safeQuery(() =>
            supabase.from('orders').select('*').eq('order_number', args.order_id).maybeSingle()
          );
          if (oByNum?.id) {
            resolvedOrderId = oByNum.id;
            targetOrder = oByNum;
          }
        } else {
          const { data: oById } = await safeQuery(() =>
            supabase.from('orders').select('*').eq('id', args.order_id).maybeSingle()
          );
          if (oById?.id) targetOrder = oById;
        }

        // Strict AI Prepaid Guard: Prepaid orders MUST be verified paid
        if (targetOrder) {
          const isCod = String(targetOrder.payment_method || '').toLowerCase().trim() === 'cod';
          const isPaid = ['paid', 'completed'].includes(String(targetOrder.payment_status || '').toLowerCase().trim());
          if (!isCod && !isPaid) {
            result = {
              success: false,
              blocked: true,
              error: 'Shipment creation blocked because the prepaid order has not been payment-verified.',
              message: 'Shipment creation blocked because the prepaid order has not been payment-verified.',
            };
            break;
          }
        }

        entityId = resolvedOrderId;
        result = await shippingService.createShipmentFromOrder(resolvedOrderId, args);
        break;
      }

      case 'confirm_cod_collection': {
        entityType = 'order';
        decision = 'confirm_cod_collection';
        let resolvedOrderId = args.order_id;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.order_id)) {
          const { data: oByNum } = await safeQuery(() =>
            supabase.from('orders').select('id').eq('order_number', args.order_id).maybeSingle()
          );
          if (oByNum?.id) resolvedOrderId = oByNum.id;
        }
        entityId = resolvedOrderId;
        const { confirmCODCollection } = require('../services/orderService');
        result = await confirmCODCollection(resolvedOrderId, 'ai_operations_agent', {
          notes: args.notes || 'Confirmed via AI Operations Agent',
        });
        break;
      }

      case 'get_shipment': {
        let shipment = null;
        if (args.shipment_id) {
          shipment = await shippingService.getShipmentById(args.shipment_id);
        } else if (args.order_id) {
          let resolvedOrderId = args.order_id;
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.order_id)) {
            const { data: oByNum } = await safeQuery(() =>
              supabase.from('orders').select('id').eq('order_number', args.order_id).maybeSingle()
            );
            if (oByNum?.id) resolvedOrderId = oByNum.id;
          }
          shipment = await shippingService.getShipmentByOrderId(resolvedOrderId);
        }
        result = shipment || { found: false, message: 'Shipment not found' };
        break;
      }

      case 'assign_awb':
        entityType = 'shipment';
        entityId = args.shipment_id;
        decision = 'assign_awb';
        result = await shippingService.assignAWB(args.shipment_id, args.courier_id);
        break;

      case 'schedule_pickup':
        entityType = 'shipment';
        entityId = args.shipment_id;
        decision = 'schedule_pickup';
        result = await shippingService.schedulePickup(args.shipment_id, args.pickup_date);
        break;

      case 'generate_shipping_label':
        result = await shippingService.generateShippingLabel(args.shipment_id);
        break;

      case 'generate_shipping_invoice':
        result = await shippingService.generateShippingInvoice(args.shipment_id);
        break;

      case 'track_shipment': {
        let targetShipmentId = args.shipment_id;
        if (!targetShipmentId && args.order_id) {
          let resolvedOrderId = args.order_id;
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.order_id)) {
            const { data: oByNum } = await safeQuery(() =>
              supabase.from('orders').select('id').eq('order_number', args.order_id).maybeSingle()
            );
            if (oByNum?.id) resolvedOrderId = oByNum.id;
          }
          const s = await shippingService.getShipmentByOrderId(resolvedOrderId);
          if (s) targetShipmentId = s.id;
        }
        if (!targetShipmentId && !args.awb_code) {
          throw new Error('Either shipment_id, order_id, or awb_code is required to track a shipment.');
        }
        if (targetShipmentId) {
          result = await shippingService.trackShipment(targetShipmentId);
        } else {
          const provider = require('../services/shipping/shippingProvider').getShippingProvider();
          result = await provider.trackShipment({ awb_code: args.awb_code });
        }
        break;
      }

      case 'get_shipping_status': {
        let shipment = null;
        let order = null;

        if (args.shipment_id) {
          shipment = await shippingService.getShipmentById(args.shipment_id);
        } else if (args.order_id) {
          let resolvedOrderId = args.order_id;
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.order_id)) {
            const { data: oByNum } = await safeQuery(() =>
              supabase.from('orders').select('id, order_number, status, created_at, shipping_address').eq('order_number', args.order_id).maybeSingle()
            );
            if (oByNum?.id) {
              resolvedOrderId = oByNum.id;
              order = oByNum;
            }
          }
          shipment = await shippingService.getShipmentByOrderId(resolvedOrderId);
          if (!shipment && !order) {
            const { data: oById } = await safeQuery(() =>
              supabase.from('orders').select('id, order_number, status, created_at, shipping_address').eq('id', resolvedOrderId).maybeSingle()
            );
            if (oById) order = oById;
          }
        }

        if (shipment) {
          result = {
            found: true,
            status: shipment.status || 'PENDING',
            awb_code: shipment.awb_code || null,
            courier_name: shipment.courier_name || null,
            tracking_url: shipment.tracking_url || null,
            shipment_id: shipment.id,
            order_id: shipment.order_id,
            details: shipment,
          };
        } else if (order) {
          result = {
            found: true,
            status: order.status || 'PENDING',
            order_number: order.order_number,
            order_id: order.id,
            shipping_address: order.shipping_address,
            message: `Order ${order.order_number || order.id} has status: ${order.status}. Shipment record is pending courier dispatch.`,
          };
        } else if (!args.shipment_id && !args.order_id) {
          // General platform shipping status summary
          const stats = await shippingService.getShippingStatistics();
          const { data: recentShipped } = await safeQuery(() =>
            supabase.from('orders').select('id, order_number, status, created_at').eq('status', 'shipped').limit(10)
          );
          result = {
            found: true,
            platform_overview: true,
            statistics: stats,
            recentShippedOrders: recentShipped || [],
            message: 'Retrieved overall platform shipping status and recent shipments overview.',
          };
        } else {
          result = {
            found: false,
            status: 'NOT_FOUND',
            message: `No shipment or order found matching identifier ${args.order_id || args.shipment_id}.`,
          };
        }
        break;
      }

      case 'get_shipping_statistics':
        result = await shippingService.getShippingStatistics();
        break;

      case 'detect_delayed_shipments': {
        const delayedShipments = await shippingService.detectDelayedShipments();
        if (delayedShipments && delayedShipments.length > 0) {
          result = {
            total: delayedShipments.length,
            delayed_shipments: delayedShipments,
            message: `${delayedShipments.length} shipment(s) identified as delayed or stalled.`,
          };
        } else {
          const threshold = args.days_threshold || 7;
          const cutoffDate = new Date(Date.now() - threshold * 24 * 60 * 60 * 1000).toISOString();
          const { data: delayedOrders } = await safeQuery(() =>
            supabase
              .from('orders')
              .select('id, order_number, status, payment_status, created_at, shipping_address')
              .in('status', ['shipped', 'processing', 'confirmed'])
              .lt('updated_at', cutoffDate)
              .order('created_at', { ascending: true })
              .limit(args.limit || 20)
          );
          result = {
            total: (delayedOrders || []).length,
            threshold_days: threshold,
            delayed_orders: delayedOrders || [],
            message: (delayedOrders || []).length === 0
              ? 'No delayed shipments or stalled orders detected across the platform.'
              : `${(delayedOrders || []).length} order(s) may be delayed beyond ${threshold} days.`,
          };
        }
        break;
      }

      case 'retry_failed_shipment':
        entityType = 'shipment';
        entityId = args.shipment_id;
        decision = 'retry_shipment';
        result = await shippingService.retryFailedShipment(args.shipment_id);
        break;

      // ─── ACTION / WRITE TOOLS ──────────────────────────────────────
      case 'verify_artisan':
        entityType = 'artisan';
        entityId = args.artisan_id;
        decision = 'verify';
        result = await artisanService.verifyArtisan(args.artisan_id, args.reason, args.confidence);
        break;

      case 'batch_verify_artisans': {
        entityType = 'artisan';
        decision = 'batch_verify';
        let targetIds = args.artisan_ids || [];
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
          const { data: pendingArtisans } = await safeQuery(() =>
            supabase.from('artisan_profiles').select('id, store_name').eq('verification_status', 'pending')
          );
          targetIds = (pendingArtisans || []).map(a => a.id);
        }

        const verifiedList = [];
        for (const id of targetIds) {
          try {
            const vRes = await artisanService.verifyArtisan(id, args.reason || 'Verified via AI Admin directive', 1.0);
            verifiedList.push(vRes);
          } catch (err) {
            console.warn(`[AI Tool Executor] Could not verify artisan ${id}:`, err.message);
          }
        }

        result = {
          success: true,
          liveOnWebsite: true,
          action: 'BATCH_ARTISANS_VERIFIED_LIVE',
          verifiedCount: verifiedList.length,
          artisans: verifiedList,
          artisanDirectoryUrl: '/artisans',
          message: `✅ Successfully verified ${verifiedList.length} artisan profiles! Their stores are now active and verified live on the website.`,
        };
        break;
      }

      case 'reject_artisan':
        entityType = 'artisan';
        entityId = args.artisan_id;
        decision = 'reject';
        result = await artisanService.rejectArtisan(args.artisan_id, args.reason);
        break;

      case 'hold_artisan':
        entityType = 'artisan';
        entityId = args.artisan_id;
        decision = 'hold';
        result = await artisanService.holdArtisan(args.artisan_id, args.reason);
        break;

      case 'approve_product':
        entityType = 'product';
        entityId = args.product_id;
        decision = 'approve';
        result = await productService.approveProduct(args.product_id, args.reason, args.confidence);
        break;

      case 'batch_approve_products': {
        entityType = 'product';
        decision = 'batch_approve';
        let targetIds = args.product_ids || [];
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
          const { data: pendingProducts } = await safeQuery(() =>
            supabase.from('products').select('id, name').neq('status', 'approved').limit(50)
          );
          targetIds = (pendingProducts || []).map(p => p.id);
        }

        const approvedList = [];
        for (const id of targetIds) {
          try {
            const pRes = await productService.approveProduct(id, args.reason || 'Approved via AI Admin directive', 1.0);
            approvedList.push(pRes);
          } catch (err) {
            console.warn(`[AI Tool Executor] Could not approve product ${id}:`, err.message);
          }
        }

        result = {
          success: true,
          liveOnWebsite: true,
          action: 'BATCH_PRODUCTS_APPROVED_LIVE',
          approvedCount: approvedList.length,
          products: approvedList,
          productsPageUrl: '/products',
          message: `✅ Successfully approved ${approvedList.length} products! They are now published live in the marketplace catalog.`,
        };
        break;
      }

      case 'reject_product':
        entityType = 'product';
        entityId = args.product_id;
        decision = 'reject';
        result = await productService.rejectProduct(args.product_id, args.reason);
        break;

      case 'hold_product':
        entityType = 'product';
        entityId = args.product_id;
        decision = 'hold';
        result = await productService.holdProduct(args.product_id, args.reason);
        break;

      case 'update_product_inventory':
        entityType = 'product';
        entityId = args.product_id;
        decision = 'inventory_adjustment';
        result = await productService.updateProductInventory(args.product_id, args.quantity, args.reason);
        break;

      case 'update_product_details': {
        entityType = 'product';
        entityId = args.product_id;
        decision = 'update_details';

        const updatePayload = {};
        if (args.name) updatePayload.name = args.name;
        if (args.price !== undefined) updatePayload.price = Number(args.price);
        if (args.original_price !== undefined) updatePayload.original_price = Number(args.original_price);
        if (args.category) updatePayload.category = args.category;
        if (args.subcategory) updatePayload.subcategory = args.subcategory;
        if (args.description) updatePayload.description = args.description;
        if (args.stock_quantity !== undefined) {
          updatePayload.stock_quantity = Number(args.stock_quantity);
          updatePayload.is_in_stock = Number(args.stock_quantity) > 0;
        }

        const { data: updatedProd, error } = await safeQuery(() =>
          supabase
            .from('products')
            .update(updatePayload)
            .eq('id', args.product_id)
            .select('id, name, price, original_price, category, subcategory, stock_quantity, is_in_stock, image_url')
            .single()
        );

        if (error) throw error;

        broadcastSync('PRODUCTS_UPDATED', { action: 'update_details', id: args.product_id, product: updatedProd });

        result = {
          success: true,
          liveOnWebsite: true,
          action: 'PRODUCT_DETAILS_UPDATED_LIVE',
          product: updatedProd,
          productPageUrl: `/product/${args.product_id}`,
          message: `✅ Product "${updatedProd.name}" details updated live in the store!`,
        };
        break;
      }

      case 'confirm_order': {
        entityType = 'order';
        entityId = args.order_id;
        decision = 'confirm';
        const { data: updated, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .update({ status: 'confirmed', order_status: 'confirmed' })
            .eq('id', args.order_id)
            .select()
            .single()
        );
        if (error) throw error;
        broadcastSync('ORDERS_UPDATED', { id: args.order_id, status: 'confirmed', order: updated });
        // Automatically dispatch notifications to assigned artisans
        await whatsappService.notifyOrderArtisans(args.order_id, 'NEW_ORDER');
        result = { success: true, order_id: args.order_id, status: 'confirmed', reason: args.reason };
        break;
      }

      case 'hold_order': {
        entityType = 'order';
        entityId = args.order_id;
        decision = 'hold';
        const { data: updated, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .update({ status: 'hold', order_status: 'hold' })
            .eq('id', args.order_id)
            .select()
            .single()
        );
        if (error) throw error;
        result = { success: true, order_id: args.order_id, status: 'hold', reason: args.reason };
        break;
      }

      case 'cancel_order': {
        entityType = 'order';
        entityId = args.order_id;
        decision = 'cancel';
        const { data: updated, error } = await safeQuery(() =>
          supabase
            .from('orders')
            .update({ status: 'cancelled', order_status: 'cancelled' })
            .eq('id', args.order_id)
            .select()
            .single()
        );
        if (error) throw error;
        broadcastSync('ORDERS_UPDATED', { id: args.order_id, status: 'cancelled', order: updated });
        result = { success: true, order_id: args.order_id, status: 'cancelled', reason: args.reason };
        break;
      }

      case 'send_artisan_whatsapp':
        entityType = 'artisan';
        entityId = args.artisan_id;
        decision = 'whatsapp_dispatch';
        result = await whatsappService.sendArtisanOrderWhatsApp({
          artisanId: args.artisan_id,
          orderId: args.order_id,
          notificationType: args.notification_type || 'NEW_ORDER',
        });
        break;

      case 'moderate_review': {
        entityType = 'review';
        entityId = args.review_id;
        decision = args.action;
        if (args.action === 'approve') {
          await safeQuery(() => supabase.from('reviews').update({ is_approved: true }).eq('id', args.review_id));
        } else if (args.action === 'hide') {
          await safeQuery(() => supabase.from('reviews').update({ is_approved: false }).eq('id', args.review_id));
        } else if (args.action === 'delete') {
          await safeQuery(() => supabase.from('reviews').delete().eq('id', args.review_id));
        }
        result = { success: true, review_id: args.review_id, action: args.action, reason: args.reason };
        break;
      }

      case 'approve_review': {
        entityType = 'review';
        entityId = args.review_id;
        decision = 'approve';
        const { data: reviewData, error } = await safeQuery(() =>
          supabase
            .from('reviews')
            .update({ is_approved: true })
            .eq('id', args.review_id)
            .select()
            .single()
        );
        if (error) throw error;
        broadcastSync('REVIEWS_UPDATED', { action: 'approve', id: args.review_id, review: reviewData });
        result = {
          success: true,
          liveOnWebsite: true,
          review_id: args.review_id,
          message: `✅ Customer review approved and published live!`,
        };
        break;
      }

      case 'batch_approve_reviews': {
        entityType = 'review';
        decision = 'batch_approve';
        let query = supabase.from('reviews').update({ is_approved: true });
        if (Array.isArray(args.review_ids) && args.review_ids.length > 0) {
          query = query.in('id', args.review_ids);
        } else {
          query = query.eq('is_approved', false);
        }
        const { data: approvedReviews, error } = await safeQuery(() => query.select());
        if (error) throw error;
        broadcastSync('REVIEWS_UPDATED', { action: 'batch_approve', count: (approvedReviews || []).length });
        result = {
          success: true,
          liveOnWebsite: true,
          approvedCount: (approvedReviews || []).length,
          message: `✅ Successfully approved ${(approvedReviews || []).length} customer reviews live on the website!`,
        };
        break;
      }

      case 'resolve_complaint':
        entityType = 'complaint';
        entityId = args.complaint_id;
        decision = args.new_status;
        result = await complaintService.resolveComplaint(args.complaint_id, args.new_status, args.resolution_notes);
        break;

      case 'generate_daily_business_report':
        entityType = 'report';
        decision = 'report_generated';
        result = await analyticsReportService.generateDailyReport(args.report_date);
        break;

      case 'update_automation_rule': {
        entityType = 'rule';
        entityId = args.rule_id;
        decision = args.is_enabled ? 'enable' : 'disable';
        inMemoryRules[args.rule_id] = Boolean(args.is_enabled);
        try {
          await safeQuery(() =>
            supabase
              .from('ai_automation_rules')
              .update({ is_enabled: Boolean(args.is_enabled), updated_at: new Date().toISOString() })
              .eq('id', args.rule_id)
          );
        } catch (e) {}
        result = { success: true, rule_id: args.rule_id, is_enabled: Boolean(args.is_enabled) };
        break;
      }

      default:
        throw new Error(`Unrecognized tool: "${toolName}". Tool is outside permitted autonomous capabilities.`);
    }

    // Record audit entry for write operations and significant read actions
    const isWrite = [
      'verify_artisan', 'batch_verify_artisans', 'reject_artisan', 'hold_artisan',
      'approve_product', 'batch_approve_products', 'update_product_details', 'reject_product', 'hold_product',
      'update_product_inventory', 'confirm_order', 'hold_order', 'cancel_order',
      'send_artisan_whatsapp', 'moderate_review', 'approve_review', 'batch_approve_reviews', 'resolve_complaint',
      'generate_daily_business_report', 'update_automation_rule',
      // Shipping write tools
      'create_shiprocket_order', 'confirm_cod_collection', 'assign_awb', 'schedule_pickup', 'retry_failed_shipment',
      // Live storefront tools
      'add_hero_banner', 'remove_hero_banner', 'update_discount_banner', 'launch_festival_campaign', 'update_site_settings',
      'create_approval_request', 'create_hero_banner_approval', 'generate_marketing_campaign',
      'generate_product_description', 'generate_ad_copy',
    ].includes(toolName);

    if (isWrite) {
      await recordAuditAction({
        conversationId,
        eventType,
        entityType,
        entityId,
        actionName: toolName,
        toolName,
        inputSummary: args,
        decision,
        reason,
        confidence,
        result,
        status: 'success',
      });
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error(`❌ [AI Tool Executor] Error executing ${toolName}:`, error.message);

    await recordAuditAction({
      conversationId,
      eventType,
      entityType: null,
      entityId: args.artisan_id || args.product_id || args.order_id || null,
      actionName: toolName,
      toolName,
      inputSummary: args,
      decision: 'failed',
      reason: error.message,
      status: 'failed',
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Tool execution failed',
      tool: toolName,
    };
  }
}

module.exports = {
  executeTool,
  executeAITool: executeTool, // Alias for backward-compatibility
  recordAuditAction,
  getInMemoryAuditLogs: () => inMemoryAuditLogs,
  getInMemoryRules: () => inMemoryRules,
};
