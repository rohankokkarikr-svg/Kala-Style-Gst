/**
 * backend/ai/aiTools.js
 * ─────────────────────────────────────────────────────────────────
 * OpenAI Tool Calling Definitions with Strict Structured JSON Schemas.
 * Every tool maps strictly to authorized backend business functions.
 * NO arbitrary SQL or system execution tools are ever defined.
 */

const AI_TOOLS = [
  // ─── READ TOOLS ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_artisans',
      description: 'Fetch artisan profiles filtered by verification status or search keywords.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'pending', 'verified', 'rejected', 'suspended'],
            description: 'Filter by verification status',
          },
          search: {
            type: 'string',
            description: 'Search by artisan store name, craft type, or location',
          },
          limit: {
            type: 'integer',
            description: 'Maximum records to return (1-50)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_artisans',
      description: 'Fetch all artisans awaiting operational verification and background review.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Maximum artisans to retrieve (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_artisan_details',
      description: 'Retrieve detailed information for a specific artisan including bio, craft specialization, years of experience, and products.',
      parameters: {
        type: 'object',
        properties: {
          artisan_id: { type: 'string', description: 'UUID of the artisan' },
        },
        required: ['artisan_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_products',
      description: 'Retrieve products from catalog with optional category, stock, or status filtering.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Category name' },
          status: {
            type: 'string',
            enum: ['all', 'approved', 'pending', 'rejected'],
            description: 'Product approval status',
          },
          search: { type: 'string', description: 'Product title or keywords' },
          limit: { type: 'integer', description: 'Maximum products to return (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_products',
      description: 'Fetch all recently submitted craft products waiting for catalog approval.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Maximum items to retrieve (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_low_stock_products',
      description: 'Identify craft items with inventory below a threshold or completely out of stock.',
      parameters: {
        type: 'object',
        properties: {
          threshold: { type: 'integer', description: 'Stock quantity threshold (default 5)' },
          limit: { type: 'integer', description: 'Maximum items to return (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_orders',
      description: 'Retrieve customer orders with status, payment details, and artisan routing.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
            description: 'Order status',
          },
          payment_status: {
            type: 'string',
            enum: ['all', 'pending', 'cod_pending', 'paid', 'failed', 'refunded'],
            description: 'Payment status',
          },
          limit: { type: 'integer', description: 'Max orders to fetch (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_details',
      description: 'Fetch complete details for a specific order including items, artisan sub-orders, and shipping destination.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID or order number' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_failed_payments',
      description: 'Retrieve orders where payment attempts failed or are marked as pending beyond standard thresholds.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max records (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_reviews',
      description: 'Fetch customer reviews to inspect sentiment, authenticity, and approval states.',
      parameters: {
        type: 'object',
        properties: {
          is_approved: { type: 'boolean', description: 'Filter by moderation approval status' },
          limit: { type: 'integer', description: 'Max reviews (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_complaints',
      description: 'Retrieve reports and complaints submitted by customers or artisans.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'open', 'under_review', 'resolved', 'rejected'],
            description: 'Complaint status',
          },
          limit: { type: 'integer', description: 'Max complaints (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_business_analytics',
      description: 'Calculate real-time business KPIs: total revenue, order volume, active artisans, top categories, and pending actions.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'this_week', 'this_month', 'all_time'],
            description: 'Timeframe for aggregation',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ai_queue_status',
      description: 'Check status of autonomous AI background jobs: pending, processing, completed, or failed.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_automation_rules',
      description: 'Fetch configured AI automation rules and feature toggles.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_ai_actions',
      description: 'Review recent autonomous operational actions logged by the AI manager.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Number of recent actions to fetch (default 20)' },
        },
      },
    },
  },

  // ─── ACTION / WRITE TOOLS ─────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'verify_artisan',
      description: 'Approve an artisan after background validation, granting verified status and store permissions.',
      parameters: {
        type: 'object',
        properties: {
          artisan_id: { type: 'string', description: 'UUID of the artisan' },
          confidence: { type: 'number', description: 'Confidence score between 0.0 and 1.0' },
          reason: { type: 'string', description: 'Documented operational rationale for verification' },
        },
        required: ['artisan_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_artisan',
      description: 'Reject an artisan profile that fails authenticity or safety guidelines.',
      parameters: {
        type: 'object',
        properties: {
          artisan_id: { type: 'string', description: 'UUID of the artisan' },
          reason: { type: 'string', description: 'Detailed justification for rejection' },
        },
        required: ['artisan_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hold_artisan',
      description: 'Place an artisan on hold pending additional verification documents or bio details.',
      parameters: {
        type: 'object',
        properties: {
          artisan_id: { type: 'string', description: 'UUID of the artisan' },
          reason: { type: 'string', description: 'Reason information is required' },
        },
        required: ['artisan_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_product',
      description: 'Approve a submitted craft product and make it live on the marketplace.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'UUID of the product' },
          confidence: { type: 'number', description: 'Confidence score (0.0 - 1.0)' },
          reason: { type: 'string', description: 'Operational reason for approval' },
        },
        required: ['product_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_product',
      description: 'Reject a product submission due to policy violation, pricing anomalies, or inappropriate content.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'UUID of the product' },
          reason: { type: 'string', description: 'Reason for rejection' },
        },
        required: ['product_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hold_product',
      description: 'Hold a product from marketplace listing for manual review or photography improvement.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'UUID of the product' },
          reason: { type: 'string', description: 'Reason for holding' },
        },
        required: ['product_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_product_inventory',
      description: 'Safely adjust product stock quantity and update availability status atomically.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'UUID of the product' },
          quantity: { type: 'integer', description: 'New stock quantity (must be >= 0)' },
          reason: { type: 'string', description: 'Reason for stock change' },
        },
        required: ['product_id', 'quantity'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_order',
      description: 'Mark an order as confirmed after payment validation or COD risk approval.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID of the order' },
          reason: { type: 'string', description: 'Verification justification' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hold_order',
      description: 'Place an order on hold due to suspicious signals or address inconsistency.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID of the order' },
          reason: { type: 'string', description: 'Risk reason' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_order',
      description: 'Cancel an order due to payment failure, stock outage, or policy violation.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID of the order' },
          reason: { type: 'string', description: 'Cancellation reason' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_artisan_whatsapp',
      description: 'Dispatch a targeted Twilio WhatsApp notification to an artisan containing strictly their assigned products from an order.',
      parameters: {
        type: 'object',
        properties: {
          artisan_id: { type: 'string', description: 'UUID of the artisan' },
          order_id: { type: 'string', description: 'UUID of the order' },
          notification_type: {
            type: 'string',
            enum: ['NEW_ORDER', 'UTR_SUBMITTED', 'ORDER_CANCELLED'],
            description: 'Type of WhatsApp notification',
          },
        },
        required: ['artisan_id', 'order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moderate_review',
      description: 'Moderate a review by approving, hiding, or deleting it.',
      parameters: {
        type: 'object',
        properties: {
          review_id: { type: 'string', description: 'UUID of the review' },
          action: {
            type: 'string',
            enum: ['approve', 'hide', 'delete'],
            description: 'Action to perform on review',
          },
          reason: { type: 'string', description: 'Reason for moderation action' },
        },
        required: ['review_id', 'action', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_complaint',
      description: 'Update the resolution status and admin notes for a customer/artisan report.',
      parameters: {
        type: 'object',
        properties: {
          complaint_id: { type: 'string', description: 'UUID of the report/complaint' },
          new_status: {
            type: 'string',
            enum: ['resolved', 'under_review', 'rejected'],
            description: 'New resolution status',
          },
          resolution_notes: { type: 'string', description: 'Resolution explanation' },
        },
        required: ['complaint_id', 'new_status', 'resolution_notes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_daily_business_report',
      description: 'Compile authoritative platform metrics, analyze operational performance, and store a daily AI intelligence report.',
      parameters: {
        type: 'object',
        properties: {
          report_date: { type: 'string', description: 'YYYY-MM-DD date format (optional, defaults to today)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_automation_rule',
      description: 'Enable or disable an autonomous operational rule.',
      parameters: {
        type: 'object',
        properties: {
          rule_id: {
            type: 'string',
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
          is_enabled: { type: 'boolean', description: 'True to enable, false to disable' },
        },
        required: ['rule_id', 'is_enabled'],
      },
    },
  },
];

module.exports = {
  AI_TOOLS,
};
