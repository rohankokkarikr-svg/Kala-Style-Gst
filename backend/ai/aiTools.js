/**
 * backend/ai/aiTools.js
 * ─────────────────────────────────────────────────────────────────
 * Google Gemini Tool Calling Declarations with Strict Structured JSON Schemas.
 * Maps strictly to authorized backend business functions.
 * NO arbitrary SQL or system execution tools are ever defined.
 */

const FUNCTION_DECLARATIONS = [
  // ─── SYSTEM HEALTH TOOLS ─────────────────────────────────────────
  {
    name: 'get_system_health',
    description: 'Perform a real-time connectivity check across all platform services: Database, Gemini AI, Razorpay, Cloudinary, Twilio/WhatsApp, and Shiprocket. Returns actual service status — never fabricated.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_recent_errors',
    description: 'Retrieve recently failed AI tool executions from the audit log for diagnostics.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Number of recent errors to retrieve (default 10)' },
      },
    },
  },

  // ─── MARKETING TOOLS ─────────────────────────────────────────────
  {
    name: 'generate_marketing_campaign',
    description: 'Generate a complete marketing campaign for a theme or festival (e.g., Diwali, Raksha Bandhan). Analyzes current inventory, selects relevant products, generates campaign copy. Requires admin approval before publishing.',
    parameters: {
      type: 'OBJECT',
      properties: {
        theme: {
          type: 'STRING',
          description: 'Campaign theme (e.g., "Diwali", "Raksha Bandhan", "Handmade Gifts", "Summer Sale")',
        },
        platform: {
          type: 'STRING',
          enum: ['Instagram', 'Facebook', 'WhatsApp', 'Email', 'Social Media'],
          description: 'Target platform for the campaign',
        },
        audience: {
          type: 'STRING',
          description: 'Target audience description (e.g., "young urban professionals", "gift buyers")',
        },
        category: {
          type: 'STRING',
          description: 'Focus on a specific product category (optional)',
        },
      },
      required: ['theme'],
    },
  },
  {
    name: 'generate_ad_copy',
    description: 'Generate professional ad copy variations for a specific product.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING', description: 'UUID of the product to generate copy for' },
        format: {
          type: 'STRING',
          enum: ['short', 'medium', 'long'],
          description: 'Length of ad copy (default: medium)',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'generate_product_description',
    description: 'Generate an AI-crafted product description for a product that is missing one or has a poor description.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING', description: 'UUID of the product' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'generate_social_content',
    description: 'Generate 5 ready-to-post social media captions for an occasion or a set of products.',
    parameters: {
      type: 'OBJECT',
      properties: {
        occasion: { type: 'STRING', description: 'Occasion or theme (e.g., "Diwali", "Weekend Sale", "New Arrivals")' },
        category: { type: 'STRING', description: 'Product category to feature (optional)' },
      },
    },
  },

  // ─── HERO & STOREFRONT BANNER TOOLS ─────────────────────────────
  {
    name: 'get_hero_banners',
    description: 'Retrieve current homepage hero slides/banners and discount banner to inspect active promotions.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'add_hero_banner',
    description: 'Directly add a new hero section banner slide to the live homepage hero slider. The banner will immediately be displayed on the live website.',
    parameters: {
      type: 'OBJECT',
      properties: {
        headline: {
          type: 'STRING',
          description: 'Main captivating headline for the hero banner (e.g. "Ganesh Chaturthi Utsav — Sacred Clay Idols & Heritage Crafts")',
        },
        subtitle: {
          type: 'STRING',
          description: 'Descriptive subtitle highlighting the handcrafted quality, cultural significance, or discount',
        },
        badgeText: {
          type: 'STRING',
          description: 'Top badge text (e.g. "✦ Ganesh Utsav Special", "★ 25% Off Festive Craft")',
        },
        buttonText: {
          type: 'STRING',
          description: 'Call to action button label (e.g. "Explore Festive Crafts", "Shop Eco Idols")',
        },
        buttonLink: {
          type: 'STRING',
          description: 'Target link on click (e.g. "/products", "/products?category=Traditional+Paintings+%26+Wall+Art")',
        },
        image: {
          type: 'STRING',
          description: 'Banner background image URL (optional — an appropriate high-definition festive craft image will be selected automatically if omitted)',
        },
        theme: {
          type: 'STRING',
          description: 'Festival or theme name (e.g. "Ganesh Festival", "Diwali", "Navratri")',
        },
        align: {
          type: 'STRING',
          enum: ['center', 'left', 'right'],
          description: 'Text alignment on the slide (default: center)',
        },
      },
      required: ['headline', 'subtitle'],
    },
  },
  {
    name: 'remove_hero_banner',
    description: 'Remove a hero slide from the live homepage hero slider by matching its headline or slide ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        headline: { type: 'STRING', description: 'Headline of the banner to remove (partial match)' },
        slide_id: { type: 'STRING', description: 'ID of the banner slide to remove' },
      },
    },
  },
  {
    name: 'update_discount_banner',
    description: 'Update the top promotional discount announcement banner displayed across the live website. Changes immediately appear on the live storefront.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of the promotional banner (e.g. "Ganesh Chaturthi Special Sale")' },
        description: { type: 'STRING', description: 'Supporting description text (e.g. "Use this code and get up to 30% off on handmade crafts")' },
        discount: { type: 'STRING', description: 'Discount display string (e.g. "30%", "25% OFF")' },
        code: { type: 'STRING', description: 'Coupon promo code (e.g. "GANESH30", "KALA25")' },
        discountPercentage: { type: 'INTEGER', description: 'Numeric discount percentage (e.g. 30)' },
        buttonText: { type: 'STRING', description: 'Button text (e.g. "Grab the Deal", "Explore Offers")' },
        buttonLink: { type: 'STRING', description: 'Target link path (e.g. "/products")' },
        isActive: { type: 'BOOLEAN', description: 'Whether the discount banner is visible (default: true)' },
      },
    },
  },
  {
    name: 'launch_festival_campaign',
    description: 'Completely launch a festival or seasonal campaign on the live website in one step: adds a festive hero banner to the homepage, activates the top promotional discount banner with a festival coupon code, and curates festival products.',
    parameters: {
      type: 'OBJECT',
      properties: {
        theme: { type: 'STRING', description: 'Festival or season theme (e.g. "Ganesh Festival", "Diwali", "Dussehra", "Raksha Bandhan")' },
        headline: { type: 'STRING', description: 'Headline for the hero banner' },
        subtitle: { type: 'STRING', description: 'Subtitle for the hero banner' },
        discount: { type: 'STRING', description: 'Discount percentage or text (e.g. "30%", "25% OFF")' },
        code: { type: 'STRING', description: 'Coupon code for the campaign (e.g. "GANESH30")' },
        badgeText: { type: 'STRING', description: 'Badge text on banner (e.g. "✦ Ganesh Utsav Special")' },
        category: { type: 'STRING', description: 'Category to feature (optional)' },
      },
      required: ['theme'],
    },
  },
  {
    name: 'update_site_settings',
    description: 'Update global store and platform settings displayed across the live website: storeName, supportEmail, supportPhone, delivery_fee, free_delivery_above, cod_enabled, maintenanceMode, shipping_estimated_days.',
    parameters: {
      type: 'OBJECT',
      properties: {
        storeName: { type: 'STRING', description: 'Store / Brand Name' },
        supportEmail: { type: 'STRING', description: 'Customer support email' },
        supportPhone: { type: 'STRING', description: 'Customer support phone number' },
        delivery_fee: { type: 'NUMBER', description: 'Standard delivery fee in INR' },
        free_delivery_above: { type: 'NUMBER', description: 'Minimum cart value for free delivery in INR (0 for always free)' },
        shipping_estimated_days: { type: 'STRING', description: 'Estimated delivery window (e.g. "2 - 4 Business Days")' },
        cod_enabled: { type: 'BOOLEAN', description: 'Enable or disable Cash on Delivery' },
        maintenanceMode: { type: 'BOOLEAN', description: 'Enable or disable maintenance mode' },
      },
    },
  },
  {
    name: 'create_hero_banner_approval',
    description: 'Propose and register an approval request to add a new hero section banner to the homepage for a festival or occasion (e.g., Ganesh Festival, Diwali, Handloom Utsav). Once the admin clicks Approve in the Approvals tab, this banner immediately publishes live to the homepage.',
    parameters: {
      type: 'OBJECT',
      properties: {
        headline: {
          type: 'STRING',
          description: 'Main captivating headline for the hero banner (e.g. "Ganesh Chaturthi Utsav — Sacred Clay Idols & Heritage Crafts")',
        },
        subtitle: {
          type: 'STRING',
          description: 'Descriptive subtitle highlighting the handcrafted quality, cultural significance, or discount',
        },
        badgeText: {
          type: 'STRING',
          description: 'Top badge text (e.g. "✦ Ganesh Utsav Special", "★ 25% Off Festive Craft")',
        },
        buttonText: {
          type: 'STRING',
          description: 'Call to action button label (e.g. "Explore Festive Crafts", "Shop Eco Idols")',
        },
        buttonLink: {
          type: 'STRING',
          description: 'Target link on click (e.g. "/products", "/products?category=Traditional+Paintings+%26+Wall+Art")',
        },
        image: {
          type: 'STRING',
          description: 'Banner background image URL (optional — an appropriate high-definition festive craft image will be selected automatically if omitted)',
        },
        theme: {
          type: 'STRING',
          description: 'Festival or theme name (e.g. "Ganesh Festival", "Diwali", "Navratri")',
        },
        align: {
          type: 'STRING',
          enum: ['center', 'left', 'right'],
          description: 'Text alignment on the slide (default: center)',
        },
      },
      required: ['headline', 'subtitle'],
    },
  },
  {
    name: 'update_hero_banners',
    description: 'Directly update homepage hero slides. When called without prior authorization, it pauses for administrative approval.',
    parameters: {
      type: 'OBJECT',
      properties: {
        slides: {
          type: 'ARRAY',
          description: 'List of hero slide objects to set',
          items: {
            type: 'OBJECT',
            properties: {
              headline: { type: 'STRING' },
              subtitle: { type: 'STRING' },
              image: { type: 'STRING' },
              buttonText: { type: 'STRING' },
              buttonLink: { type: 'STRING' },
              badgeText: { type: 'STRING' },
              align: { type: 'STRING' },
            },
            required: ['headline', 'subtitle'],
          },
        },
        mode: {
          type: 'STRING',
          enum: ['append', 'replace'],
          description: 'Whether to prepend to existing slides or replace all slides (default: append)',
        },
      },
      required: ['slides'],
    },
  },

  // ─── RECOMMENDATION TOOLS ─────────────────────────────────────────
  {
    name: 'get_seasonal_context',
    description: 'Get the current Indian seasonal and festival context to understand what to promote right now.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'suggest_seasonal_products',
    description: 'Analyze inventory and suggest which products to promote based on the current Indian festival season. Returns real in-stock products matched to seasonal demand.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Maximum products to suggest (default 12)' },
      },
    },
  },
  {
    name: 'generate_product_recommendations',
    description: 'Generate product recommendations filtered by category.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'Product category to filter by' },
        limit: { type: 'INTEGER', description: 'Maximum recommendations to return (default 10)' },
      },
    },
  },
  {
    name: 'analyze_seasonal_inventory',
    description: 'Analyze current inventory against seasonal demand — identifies products to restock urgently and products ready to promote for the current season.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },

  // ─── SHIPPING TOOLS ───────────────────────────────────────────────
  {
    name: 'get_shipping_status',
    description: 'Check Shiprocket shipping integration status and get recent shipment information.',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_id: { type: 'STRING', description: 'UUID or order number to check shipping for (optional — omit for overall status)' },
      },
    },
  },
  {
    name: 'detect_delayed_shipments',
    description: 'Identify orders that have been confirmed or shipped but show no delivery progress beyond expected timeframes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        days_threshold: { type: 'INTEGER', description: 'Orders shipped more than N days ago without delivery (default 7)' },
        limit: { type: 'INTEGER', description: 'Maximum orders to return (default 20)' },
      },
    },
  },

  // ─── APPROVAL MANAGEMENT TOOLS ────────────────────────────────────
  {
    name: 'get_pending_approvals',
    description: 'List all HIGH and CRITICAL actions currently waiting for admin approval before they can execute.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'create_approval_request',
    description: 'Create an approval request for a HIGH-risk action that requires explicit admin confirmation before execution. Use this instead of directly executing dangerous operations.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tool_name: { type: 'STRING', description: 'Name of the tool/action requiring approval' },
        description: { type: 'STRING', description: 'Clear human-readable description of what this action will do' },
        risk_level: {
          type: 'STRING',
          enum: ['HIGH', 'CRITICAL'],
          description: 'Risk classification of the action',
        },
        tool_args: {
          type: 'OBJECT',
          description: 'Arguments that will be passed to the tool upon approval',
          properties: {},
        },
      },
      required: ['tool_name', 'description'],
    },
  },

  // ─── AGENT MEMORY TOOLS ───────────────────────────────────────────
  {
    name: 'get_agent_memory',
    description: 'Retrieve stored operational preferences and context from agent memory.',
    parameters: {
      type: 'OBJECT',
      properties: {
        memory_type: {
          type: 'STRING',
          enum: ['all', 'preference', 'operational', 'context'],
          description: 'Filter by memory type',
        },
      },
    },
  },


  // ─── READ TOOLS ──────────────────────────────────────────────────
  {
    name: 'get_artisans',
    description: 'Fetch artisan profiles filtered by verification status or search keywords.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          enum: ['all', 'pending', 'verified', 'rejected', 'suspended'],
          description: 'Filter by verification status',
        },
        search: {
          type: 'STRING',
          description: 'Search by artisan store name, craft type, or location',
        },
        limit: {
          type: 'INTEGER',
          description: 'Maximum records to return (1-50)',
        },
      },
    },
  },
  {
    name: 'get_pending_artisans',
    description: 'Fetch all artisans awaiting operational verification and background review.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Maximum artisans to retrieve (default 20)' },
      },
    },
  },
  {
    name: 'get_artisan_details',
    description: 'Retrieve detailed information for a specific artisan including bio, craft specialization, years of experience, and products.',
    parameters: {
      type: 'OBJECT',
      properties: {
        artisan_id: { type: 'STRING', description: 'UUID of the artisan' },
      },
      required: ['artisan_id'],
    },
  },
  {
    name: 'get_products',
    description: 'Retrieve products from catalog with optional category, stock, or status filtering.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'Category name' },
        status: {
          type: 'STRING',
          enum: ['all', 'approved', 'pending', 'rejected'],
          description: 'Product approval status',
        },
        search: { type: 'STRING', description: 'Product title or keywords' },
        limit: { type: 'INTEGER', description: 'Maximum products to return (default 20)' },
      },
    },
  },
  {
    name: 'get_pending_products',
    description: 'Fetch all recently submitted craft products waiting for catalog approval.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Maximum items to retrieve (default 20)' },
      },
    },
  },
  {
    name: 'get_low_stock_products',
    description: 'Identify craft items with inventory below a threshold or completely out of stock.',
    parameters: {
      type: 'OBJECT',
      properties: {
        threshold: { type: 'INTEGER', description: 'Stock quantity threshold (default 5)' },
        limit: { type: 'INTEGER', description: 'Maximum items to return (default 20)' },
      },
    },
  },
  {
    name: 'get_orders',
    description: 'Retrieve customer orders with status, payment details, and artisan routing.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          enum: ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
          description: 'Order status',
        },
        payment_status: {
          type: 'STRING',
          enum: ['all', 'pending', 'cod_pending', 'paid', 'failed', 'refunded'],
          description: 'Payment status',
        },
        limit: { type: 'INTEGER', description: 'Max orders to fetch (default 20)' },
      },
    },
  },
  {
    name: 'get_order_details',
    description: 'Fetch complete details for a specific order including items, artisan sub-orders, and shipping destination.',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_id: { type: 'STRING', description: 'UUID or order number' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'get_failed_payments',
    description: 'Retrieve orders where payment attempts failed or are marked as pending beyond standard thresholds.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Max records (default 20)' },
      },
    },
  },
  {
    name: 'get_suspicious_orders',
    description: 'Retrieve orders flagged by AI risk engine as review_required or high_risk.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          enum: ['all', 'review_required', 'high_risk'],
          description: 'Filter by risk classification',
        },
        limit: { type: 'INTEGER', description: 'Maximum orders to fetch (default 20)' },
      },
    },
  },
  {
    name: 'analyze_order_risk',
    description: 'Perform on-demand behavioral risk scoring and fraud signal inspection on an order.',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_id: { type: 'STRING', description: 'UUID or order number to inspect' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'get_reviews',
    description: 'Fetch customer reviews to inspect sentiment, authenticity, and approval states.',
    parameters: {
      type: 'OBJECT',
      properties: {
        is_approved: { type: 'BOOLEAN', description: 'Filter by moderation approval status' },
        limit: { type: 'INTEGER', description: 'Max reviews (default 20)' },
      },
    },
  },
  {
    name: 'get_complaints',
    description: 'Retrieve reports and complaints submitted by customers or artisans.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          enum: ['all', 'open', 'under_review', 'resolved', 'rejected'],
          description: 'Complaint status',
        },
        limit: { type: 'INTEGER', description: 'Max complaints (default 20)' },
      },
    },
  },
  {
    name: 'get_business_analytics',
    description: 'Calculate real-time business KPIs: total revenue, order volume, active artisans, top categories, and pending actions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        period: {
          type: 'STRING',
          enum: ['today', 'this_week', 'this_month', 'all_time'],
          description: 'Timeframe for aggregation',
        },
      },
    },
  },
  {
    name: 'get_ai_queue_status',
    description: 'Check status of autonomous AI background jobs: pending, processing, completed, or failed.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_automation_rules',
    description: 'Fetch configured AI automation rules and feature toggles.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_recent_ai_actions',
    description: 'Review recent autonomous operational actions logged by the AI manager.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Number of recent actions to fetch (default 20)' },
      },
    },
  },

  // ─── ACTION / WRITE TOOLS ─────────────────────────────────────────
  {
    name: 'verify_artisan',
    description: 'Approve an artisan after background validation, granting verified status and store permissions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        artisan_id: { type: 'STRING', description: 'UUID of the artisan' },
        confidence: { type: 'NUMBER', description: 'Confidence score between 0.0 and 1.0' },
        reason: { type: 'STRING', description: 'Documented operational rationale for verification' },
      },
      required: ['artisan_id', 'reason'],
    },
  },
  {
    name: 'batch_verify_artisans',
    description: 'Verify multiple or all pending artisans and activate their stores live on the website.',
    parameters: {
      type: 'OBJECT',
      properties: {
        artisan_ids: {
          type: 'ARRAY',
          description: 'Array of artisan UUIDs to verify (optional — leave empty to verify all pending artisans)',
          items: { type: 'STRING' },
        },
        reason: { type: 'STRING', description: 'Verification rationale' },
      },
    },
  },
  {
    name: 'reject_artisan',
    description: 'Reject an artisan profile that fails authenticity or safety guidelines.',
    parameters: {
      type: 'OBJECT',
      properties: {
        artisan_id: { type: 'STRING', description: 'UUID of the artisan' },
        reason: { type: 'STRING', description: 'Detailed justification for rejection' },
      },
      required: ['artisan_id', 'reason'],
    },
  },
  {
    name: 'hold_artisan',
    description: 'Place an artisan on hold pending additional verification documents or bio details.',
    parameters: {
      type: 'OBJECT',
      properties: {
        artisan_id: { type: 'STRING', description: 'UUID of the artisan' },
        reason: { type: 'STRING', description: 'Reason information is required' },
      },
      required: ['artisan_id', 'reason'],
    },
  },
  {
    name: 'approve_product',
    description: 'Approve a submitted craft product and make it live on the marketplace.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING', description: 'UUID of the product' },
        confidence: { type: 'NUMBER', description: 'Confidence score (0.0 - 1.0)' },
        reason: { type: 'STRING', description: 'Operational reason for approval' },
      },
      required: ['product_id', 'reason'],
    },
  },
  {
    name: 'batch_approve_products',
    description: 'Approve multiple or all pending products and publish them live to the marketplace catalog so customers can view and buy them immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_ids: {
          type: 'ARRAY',
          description: 'Array of product UUIDs to approve (optional — leave empty to approve all pending products)',
          items: { type: 'STRING' },
        },
        reason: { type: 'STRING', description: 'Operational reason for approval' },
      },
    },
  },
  {
    name: 'reject_product',
    description: 'Reject a product submission due to policy violation, pricing anomalies, or inappropriate content.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING', description: 'UUID of the product' },
        reason: { type: 'STRING', description: 'Reason for rejection' },
      },
      required: ['product_id', 'reason'],
    },
  },
  {
    name: 'hold_product',
    description: 'Hold a product from marketplace listing for manual review or photography improvement.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING', description: 'UUID of the product' },
        reason: { type: 'STRING', description: 'Reason for holding' },
      },
      required: ['product_id', 'reason'],
    },
  },
  {
    name: 'update_product_inventory',
    description: 'Safely adjust product stock quantity and update availability status atomically.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING', description: 'UUID of the product' },
        quantity: { type: 'INTEGER', description: 'New stock quantity (must be >= 0)' },
        reason: { type: 'STRING', description: 'Reason for stock change' },
      },
      required: ['product_id', 'quantity'],
    },
  },
  {
    name: 'update_product_details',
    description: 'Update a craft product details live in the marketplace catalog: price, original_price, category, subcategory, name, or description.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING', description: 'UUID of the product' },
        name: { type: 'STRING', description: 'New product title/name' },
        price: { type: 'NUMBER', description: 'Selling price in INR' },
        original_price: { type: 'NUMBER', description: 'Original strike-through MRP in INR' },
        category: { type: 'STRING', description: 'Product category' },
        subcategory: { type: 'STRING', description: 'Product subcategory' },
        description: { type: 'STRING', description: 'Updated product description' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'confirm_order',
    description: 'Mark an order as confirmed after payment validation or COD risk approval.',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_id: { type: 'STRING', description: 'UUID of the order' },
        reason: { type: 'STRING', description: 'Verification justification' },
      },
      required: ['order_id', 'reason'],
    },
  },
  {
    name: 'hold_order',
    description: 'Place an order on hold due to suspicious signals or address inconsistency.',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_id: { type: 'STRING', description: 'UUID of the order' },
        reason: { type: 'STRING', description: 'Risk reason' },
      },
      required: ['order_id', 'reason'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel an order due to payment failure, stock outage, or policy violation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_id: { type: 'STRING', description: 'UUID of the order' },
        reason: { type: 'STRING', description: 'Cancellation reason' },
      },
      required: ['order_id', 'reason'],
    },
  },
  {
    name: 'send_artisan_whatsapp',
    description: 'Dispatch a targeted Twilio WhatsApp notification to an artisan containing strictly their assigned products from an order.',
    parameters: {
      type: 'OBJECT',
      properties: {
        artisan_id: { type: 'STRING', description: 'UUID of the artisan' },
        order_id: { type: 'STRING', description: 'UUID of the order' },
        notification_type: {
          type: 'STRING',
          enum: ['NEW_ORDER', 'UTR_SUBMITTED', 'ORDER_CANCELLED'],
          description: 'Type of WhatsApp notification',
        },
      },
      required: ['artisan_id', 'order_id'],
    },
  },
  {
    name: 'moderate_review',
    description: 'Moderate a review by approving, hiding, or deleting it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        review_id: { type: 'STRING', description: 'UUID of the review' },
        action: {
          type: 'STRING',
          enum: ['approve', 'hide', 'delete'],
          description: 'Action to perform on review',
        },
        reason: { type: 'STRING', description: 'Reason for moderation action' },
      },
      required: ['review_id', 'action', 'reason'],
    },
  },
  {
    name: 'batch_approve_reviews',
    description: 'Approve all pending customer reviews and publish them live across all products.',
    parameters: {
      type: 'OBJECT',
      properties: {
        review_ids: {
          type: 'ARRAY',
          description: 'Optional array of review IDs to approve (omit to approve all pending reviews)',
          items: { type: 'STRING' },
        },
      },
    },
  },
  {
    name: 'resolve_complaint',
    description: 'Update the resolution status and admin notes for a customer/artisan report.',
    parameters: {
      type: 'OBJECT',
      properties: {
        complaint_id: { type: 'STRING', description: 'UUID of the report/complaint' },
        new_status: {
          type: 'STRING',
          enum: ['resolved', 'under_review', 'rejected'],
          description: 'New resolution status',
        },
        resolution_notes: { type: 'STRING', description: 'Resolution explanation' },
      },
      required: ['complaint_id', 'new_status', 'resolution_notes'],
    },
  },
  {
    name: 'generate_daily_business_report',
    description: 'Compile authoritative platform metrics, analyze operational performance, and store a daily AI intelligence report.',
    parameters: {
      type: 'OBJECT',
      properties: {
        report_date: { type: 'STRING', description: 'YYYY-MM-DD date format (optional, defaults to today)' },
      },
    },
  },
  {
    name: 'update_automation_rule',
    description: 'Enable or disable an autonomous operational rule.',
    parameters: {
      type: 'OBJECT',
      properties: {
        rule_id: {
          type: 'STRING',
          enum: [
            'artisan_auto_verification',
            'product_auto_approval',
            'order_auto_processing',
            'inventory_monitoring',
            'review_moderation',
            'daily_ai_report',
            'whatsapp_notifications',
          ],
          description: 'Key identifier of the automation rule',
        },
        is_enabled: { type: 'BOOLEAN', description: 'True to enable, false to disable' },
      },
      required: ['rule_id', 'is_enabled'],
    },
  },
  // ─── SHIPROCKET SHIPPING & LOGISTICS TOOLS ─────────────────────────────
  {
    name: 'check_shipping_serviceability',
    description: 'Check whether a customer PIN code is serviceable by courier partners, and check available rates and COD support.',
    parameters: {
      type: 'OBJECT',
      properties: {
        delivery_postcode: { type: 'STRING', description: '6-digit destination/customer postal PIN code' },
        pickup_postcode: { type: 'STRING', description: '6-digit origin/artisan postal PIN code (optional, defaults to 560001)' },
        weight: { type: 'NUMBER', description: 'Package weight in kg (default 0.5)' },
        cod: { type: 'BOOLEAN', description: 'Whether Cash on Delivery is requested' },
        declared_value: { type: 'NUMBER', description: 'Declared value of order items in INR' },
      },
      required: ['delivery_postcode'],
    },
  },
  {
    name: 'get_shipping_rates',
    description: 'Calculate shipping rate estimates across multiple couriers (Delhivery, BlueDart, DTDC, Shadowfax) for an order or destination.',
    parameters: {
      type: 'OBJECT',
      properties: {
        delivery_postcode: { type: 'STRING', description: '6-digit destination postal PIN code' },
        pickup_postcode: { type: 'STRING', description: '6-digit origin postal PIN code' },
        weight: { type: 'NUMBER', description: 'Package weight in kg' },
        cod: { type: 'BOOLEAN', description: 'Whether COD is required' },
      },
      required: ['delivery_postcode'],
    },
  },
  {
    name: 'create_shiprocket_order',
    description: 'Create a shipment for a confirmed/paid order in Shiprocket logistics and register it in the marketplace.',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_id: { type: 'STRING', description: 'UUID or order number of the order to ship' },
        pickup_location: { type: 'STRING', description: 'Registered artisan pickup location nickname (optional)' },
        weight: { type: 'NUMBER', description: 'Package weight in kg (optional override)' },
        force_recreate: { type: 'BOOLEAN', description: 'Force re-creation if previous shipment failed' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'get_shipment',
    description: 'Fetch detailed shipment information by shipment ID or order ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        shipment_id: { type: 'STRING', description: 'UUID of the shipment' },
        order_id: { type: 'STRING', description: 'UUID of the order' },
      },
    },
  },
  {
    name: 'assign_awb',
    description: 'Assign Air Waybill (AWB) tracking number and courier company to a created shipment.',
    parameters: {
      type: 'OBJECT',
      properties: {
        shipment_id: { type: 'STRING', description: 'UUID of the shipment' },
        courier_id: { type: 'STRING', description: 'Specific courier company ID (optional)' },
      },
      required: ['shipment_id'],
    },
  },
  {
    name: 'schedule_pickup',
    description: 'Schedule courier pickup for an AWB-assigned shipment from artisan workshop.',
    parameters: {
      type: 'OBJECT',
      properties: {
        shipment_id: { type: 'STRING', description: 'UUID of the shipment' },
        pickup_date: { type: 'STRING', description: 'YYYY-MM-DD pickup date (optional)' },
      },
      required: ['shipment_id'],
    },
  },
  {
    name: 'generate_shipping_label',
    description: 'Generate a printable PDF shipping label URL for an order shipment.',
    parameters: {
      type: 'OBJECT',
      properties: {
        shipment_id: { type: 'STRING', description: 'UUID of the shipment' },
      },
      required: ['shipment_id'],
    },
  },
  {
    name: 'generate_shipping_invoice',
    description: 'Generate a printable tax invoice URL for an order shipment.',
    parameters: {
      type: 'OBJECT',
      properties: {
        shipment_id: { type: 'STRING', description: 'UUID of the shipment' },
      },
      required: ['shipment_id'],
    },
  },
  {
    name: 'track_shipment',
    description: 'Track live courier progress, current location, scan activities, and estimated delivery date for a shipment.',
    parameters: {
      type: 'OBJECT',
      properties: {
        shipment_id: { type: 'STRING', description: 'UUID of the shipment' },
        awb_code: { type: 'STRING', description: 'Air Waybill tracking number (optional)' },
        order_id: { type: 'STRING', description: 'Order UUID (optional)' },
      },
    },
  },
  {
    name: 'get_shipping_status',
    description: 'Get current normalized shipping status for an order or shipment.',
    parameters: {
      type: 'OBJECT',
      properties: {
        order_id: { type: 'STRING', description: 'Order UUID' },
        shipment_id: { type: 'STRING', description: 'Shipment UUID' },
      },
    },
  },
  {
    name: 'get_shipping_statistics',
    description: 'Get platform-wide logistics metrics: total shipments, in transit, delivered, delayed, and courier distribution.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'detect_delayed_shipments',
    description: 'Identify delayed, stalled, or unassigned shipments requiring administrative or operational intervention.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'retry_failed_shipment',
    description: 'Retry a failed shipment creation, AWB assignment, or pickup schedule.',
    parameters: {
      type: 'OBJECT',
      properties: {
        shipment_id: { type: 'STRING', description: 'UUID of the shipment to retry' },
      },
      required: ['shipment_id'],
    },
  },
];

const GEMINI_TOOLS = [{
  functionDeclarations: FUNCTION_DECLARATIONS,
}];

module.exports = {
  FUNCTION_DECLARATIONS,
  GEMINI_TOOLS,
  AI_TOOLS: GEMINI_TOOLS,
};
