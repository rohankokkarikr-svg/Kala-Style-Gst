# 🎨 KalaStyle AI — Digital Marketplace for Indian Artisans & Weavers

> **Tagline**: *"AI-Powered Digital Marketplace Empowering Indian Generational Artisans, Handloom Weavers & Traditional Craftsmen."*

KalaStyle AI is a startup-grade, production-hardened full-stack web platform connecting master artisans, handloom weavers, and traditional craftspeople directly with global consumers through AI-assisted studio cataloging, autonomous operational governance, atomic inventory controls, and secure multi-artisan commerce.

---

## 🚀 Key Features

### 🛍️ Customer Experience
- **Handicraft Marketplace**: Browse authentic Banarasi silks, Kanchipuram sarees, terracotta pottery, brassware, wooden crafts, and folk art.
- **Deep Multi-Field Search**: Search across craft name, rich description, category, material, style, and artisan identity.
- **Responsive Web Design**: Seamless, luxury dark-theme shopping experience across desktop, laptop, tablet, and mobile browsers.
- **Cart & Wishlist**: Real-time basket synchronization with automated stock availability validation.
- **Multi-Artisan Basket Checkout**: Purchase items from multiple regional artisans in a single checkout.
- **Standard Razorpay & Cash on Delivery (COD)**: Server-side cryptographic HMAC-SHA256 signature verification, strict idempotency, and automated stock reservation.
- **Order Tracking**: End-to-end timeline with live delivery location integration.
- **Loyalty & Rewards**: Automated milestone rewards (purchase 8 authentic crafts to unlock exclusive discounts).
- **Verified Customer Reviews**: Review system protected against XSS and spam moderation flags.

### 🧵 Artisan Workshop & AI Studio
- **Artisan Onboarding & Verification**: Digital profile, craft specialization, years of experience, regional bio, and bank/UPI payout details.
- **AI Product Studio**: Single-click AI cataloging using Google Gemini 2.5 Flash:
  - **AI Product Analysis**: Visual craft recognition, material identification, and SEO tagging.
  - **AI Description Generator**: Engaging, heritage-focused craft stories and care instructions.
  - **AI Pricing Intelligence**: Suggests fair market pricing ranges with reasoning and confidence levels without pretending to know absolute prices.
  - **Authentic Artisan Stories**: Generates respectful, factual narratives based strictly on artisan-supplied heritage.
- **Artisan Dashboard**: Track pending submissions, active listings, regional orders, net earnings, and delivery stages.

### 🤖 Autonomous AI Admin Manager
- **3-Tier AI Safety Architecture**:
  - **Level 1 (Safe)**: Autonomous reporting, business KPI analytics, low-stock detection, and review summaries.
  - **Level 2 (Controlled)**: Standard operational mutations (approving verified artisans, holding listings) recorded in immutable audit logs.
  - **Level 3 (High-Risk)**: Destructive or financial actions (refunds, large order cancellations, artisan rejections, large inventory overrides) require explicit human admin confirmation tokens.
- **Fake / Suspicious Order Detection**: Real-time behavioral risk scoring analyzing COD order thresholds, address completeness, cancellation rates, and phone patterns into `normal`, `review_required`, and `high_risk` categories.
- **Comprehensive Admin Control**: Complete management of products, artisans, orders, payments, discount coupons, activity logs, and autonomous rules.

---

## 🏛️ System Architecture

```
[Customer / Artisan / Admin Browser]
              │ (HTTPS / WSS)
              ▼
    [React 19 Frontend (SPA)]
              │
    [Centralized RealtimeSyncContext]
     ├── Axios API Client (with Interceptors)
     └── Socket.IO Client / Broadcast DOM Events
              │
              ▼
  [Express.js Backend REST API]
     ├── Helmet, RateLimiters & Timing-Safe Security
     ├── Controllers (Admin, Artisan, Order, Product, Payment, AI)
     ├── Services (Order, Payment, Reward, SuspiciousOrder, Gemini)
     └── AI Autonomous Tool Calling Engine (Google Gemini 2.5)
              │
   ┌──────────┴──────────┬─────────────────┬────────────────┐
   ▼                     ▼                 ▼                ▼
[Supabase (PostgreSQL)] [Razorpay API]  [Cloudinary]
- Atomic Inventory RPC   - Create Order   - Media CDN
- Sequential Migrations  - Timing-Safe    - MIME Guards
- Role-Based RLS          Verification
```

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Tailwind CSS, React Router v7, Context API, Lucide/Heroicons, Recharts, Framer Motion |
| **Backend** | Node.js (v24+), Express.js 5, Helmet, CORS, Express-Rate-Limit, Crypto, Multer |
| **Database** | Supabase (PostgreSQL), Stored Procedures (`deduct_product_stock`, `restore_product_stock`) |
| **Payments** | Razorpay Standard Checkout & Webhooks (HMAC SHA-256) |
| **Artificial Intelligence** | Google Gemini 2.5 Flash (`@google/genai`, Structured Function Tool Calling) |
| **Media & Storage** | Cloudinary (Secure Uploads with MIME & Extension Whitelists) |
| **Messaging & Alerts** | In-App Notifications & Direct WhatsApp Links |
| **Realtime** | Centralized Socket.IO & Supabase Event Broadcasts |

---

## 📂 Project Structure

```
Style Heaven Mens Wear → KalaStyle AI/
├── database/
│   └── migrations/                  # Sequential idempotent SQL migrations
│       ├── 001_initial_schema.sql
│       ├── 002_kalastyle_marketplace.sql
│       ├── 003_ai_admin_and_automation.sql
│       ├── 004_v2_order_system_and_payments.sql
│       └── 005_atomic_inventory_and_guards.sql
├── backend/
│   ├── ai/                          # Autonomous AI Admin & Gemini tool engine
│   │   ├── aiTools.js               # Structured JSON Schema tool declarations
│   │   ├── aiToolExecutor.js        # 3-Tier safety execution engine & audit logger
│   │   ├── aiOrchestrator.js        # Autonomous reasoning loop
│   │   └── geminiClient.js          # Google Gemini client wrapper
│   ├── config/                      # Supabase, Cloudinary, Razorpay, and E-com configs
│   ├── controllers/                 # Route business controllers
│   ├── middleware/                  # JWT auth, role authorization, rate limiters
│   ├── routes/                      # REST API routing endpoints
│   ├── services/                    # Domain services (order, payment, suspiciousOrder, etc.)
│   ├── server.js                    # Express application entry point
│   ├── test_security_hardening.js   # 50-test Defense-in-Depth security test suite
│   ├── test_ai_admin_system.js      # 25-test Gemini AI Admin test suite
│   └── test_hardening_v2.js         # Atomic inventory & risk engine validation
├── frontend/
│   ├── src/
│   │   ├── components/              # Reusable UI components & modals
│   │   ├── context/                 # AuthContext, CartContext, RealtimeSyncContext
│   │   ├── pages/                   # Customer marketplace pages
│   │   │   ├── admin/               # 16-module Admin portal
│   │   │   └── artisan/             # Artisan Studio, Catalog, and Earnings
│   │   └── services/                # Axios API client
│   ├── package.json                 # Frontend dependencies (React 19, Tailwind)
│   └── tailwind.config.js           # Custom luxury palette configuration
├── netlify.toml                     # Netlify static deployment configuration
├── render.yaml                      # Render Web Service backend blueprint
└── package.json                     # Root orchestrator scripts
```

---

## ⚙️ Environment Configuration

### Backend (`backend/.env`)
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Supabase (PostgreSQL)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Authentication
JWT_SECRET=your_super_secure_jwt_secret_min_32_chars

# Payments (Razorpay)
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# AI Studio & AI Admin (Google Gemini)
GEMINI_API_KEY=your_google_gemini_api_key

# Image CDN (Cloudinary)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### Frontend (`frontend/.env`)
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_RAZORPAY_KEY_ID=rzp_test_your_key_id
```

---

## 🛠️ Database Setup (Supabase)

1. Open your project in the [Supabase Dashboard](https://supabase.com/).
2. Navigate to the **SQL Editor**.
3. Execute the migration files sequentially from `database/migrations/`:
   - `001_initial_schema.sql` (Base tables: users, categories, products, orders, sales, coupons)
   - `002_kalastyle_marketplace.sql` (Artisans, craft fields, reviews, loyalty rewards)
   - `003_ai_admin_and_automation.sql` (AI action logs, background job queue, daily reports)
   - `004_v2_order_system_and_payments.sql` (Artisan sub-orders, payments, order tracking)
   - `005_atomic_inventory_and_guards.sql` (PostgreSQL atomic stock stored procedures & indexes)

---

## 🏃 Running Locally

### 1. Root Quick Start
```bash
npm run dev
# Concurrently starts Express backend on port 5000 and React frontend on port 3000
```

### 2. Backend Only
```bash
cd backend
npm install
npm run dev
```

### 3. Frontend Only
```bash
cd frontend
npm install
npm start
```

---

## 🧪 Verification & Test Suites

Run the built-in automated test suites:

```bash
# 1. Defense-in-Depth Security Audit (50 tests)
node backend/test_security_hardening.js

# 2. Autonomous Gemini AI Admin Engine (25 tests)
node backend/test_ai_admin_system.js

# 3. Hardening V2 (Atomic inventory, AI safety levels, suspicious order detection)
node backend/test_hardening_v2.js

# 4. Frontend Production Build
npm --prefix frontend run build
```

---

## 🚢 Production Deployment

- **Frontend (Netlify)**: Configured via `netlify.toml` with client-side SPA routing (`/* -> /index.html 200`).
- **Backend (Render)**: Configured via `render.yaml` with automatic Node.js runtime, health checks (`/api/settings`), and environment variable bindings.
- **Secrets Management**: No secrets are committed to git; all credentials are read strictly from deployment environment configurations.