# TECHNICAL REQUIREMENT DOCUMENT (TRD)

## Project: KalaStyle AI (Style Heaven Mens Wear)
**Document Version:** 1.0.0 (Engineering Architecture Release)  
**Status:** Approved & Implemented  
**Date:** September 2026  
**Target Systems:** Web Client (React 18), Mobile Client (Flutter 3.x), Backend API (Node.js/Express), Database (Supabase PostgreSQL 15), AI Brain (Google Gemini 1.5/2.0 API)

---

## 1. System Architecture & Topology

### 1.1 High-Level Component Topology
```
                     +---------------------------------------+
                     |         DNS / CDN ROUTING             |
                     |      Netlify / Cloudflare / Render    |
                     +-------------------+-------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
         +---------------------------+       +---------------------------+
         |      WEB CLIENT (SPA)     |       |    MOBILE CLIENT (APP)    |
         |    React 18 / Vite / CSS  |       |   Flutter 3.x / Riverpod  |
         |   Single-Page Application |       | Native Android (AOT) / iOS|
         +-------------+-------------+       +-------------+-------------+
                       |                                   |
                       |       REST / JSON over TLS 1.3    |
                       +-----------------+-----------------+
                                         |
                                         v
                     +---------------------------------------+
                     |          API GATEWAY / SERVER         |
                     |          Node.js 20+ / Express        |
                     |  Rate-Limiter / Helmet / JWT Auth / RBAC
                     +---+-------+-------+-------+-------+---+
                         |       |       |       |       |
         +---------------+       |       |       |       +---------------+
         |                       |       |       |                       |
         v                       v       v       v                       v
+-----------------+      +-----------------+   +-----------------+ +-----------------+
|  SUPABASE DB    |      | GOOGLE GEMINI   |   |   RAZORPAY      | | TWILIO WHATSAPP |
| PostgreSQL 15   |      | Multimodal API  |   | HMAC-SHA256 API | | REST Messaging  |
| Connection Pool |      | Function Tools  |   | Timing-Safe Ver.| | Milestone Events|
+-----------------+      +-----------------+   +-----------------+ +-----------------+
                                 |
                         +-------+-------+
                         |  CLOUDINARY   |
                         | Media Pipeline|
                         +---------------+
```

### 1.2 Data Flow Sequences

#### A. Phone-First Authentication Flow
```
User (Mobile/Web)               API Gateway (Express)              Supabase DB
       |                                  |                             |
       |--- POST /api/auth/login -------->|                             |
       |    { phone, password }           |                             |
       |                                  |--- SELECT * FROM users ---->|
       |                                  |    WHERE phone = cleanPhone |
       |                                  |<-- Returns user record -----|
       |                                  |                             |
       |                                  |-- bcrypt.compare(pass, hash)|
       |                                  |-- jwt.sign({ id, role })    |
       |<-- 200 OK + JWT + User Object ---|                             |
```

#### B. Artisan One-Click Camera to Storefront Flow
```
Artisan Phone             Cloudinary CDN          Express Backend         Google Gemini API       Supabase DB
      |                         |                        |                        |                    |
      |-- Snap Photo via Camera |                        |                        |                    |
      |-- Multi-part upload --->|                        |                        |                    |
      |<-- Returns secure_url --|                        |                        |                    |
      |                                                  |                        |                    |
      |--- POST /api/ai/describe-product --------------->|                        |                    |
      |    { image_url, voice_transcript }               |--- Gemini Prompt ----->|                    |
      |                                                  |    (multimodal vision) |                    |
      |                                                  |<-- Structured JSON ----|                    |
      |<-- Returns AI Title, Story, Price, Category -----|                        |                    |
      |                                                  |                        |                    |
      |--- POST /api/products (Publish) ---------------->|-------------------------------------------->|
      |    { title, price, images, stock, tags }         |                        |    INSERT product  |
      |<-- 201 Created (Live in Global Catalog) ---------|<--------------------------------------------|
```

---

## 2. Frontend Engineering Specifications (Web Client)

### 2.1 Technology & Tooling
- **Core Runtime**: React 18.2+, ES2022.
- **Bundler**: Vite 5.x with Hot Module Replacement (HMR).
- **Styling Architecture**: Tailwind CSS 3.x configured with KalaStyle Design Tokens:
  - `primary` (Artisan Terracotta): `#C2410C` (`hsl(18, 90%, 40%)`)
  - `secondary` (Royal Indigo): `#1E1B4B` (`hsl(244, 49%, 20%)`)
  - `accent` (Heritage Gold): `#D97706` (`hsl(38, 92%, 44%)`)
  - `background` (Obsidian Canvas): `#0F172A` / `#020617`
- **Routing Engine**: `react-router-dom` v6 with protected route wrappers (`PrivateRoute`, `AdminRoute`, `ArtisanRoute`).
- **State Management**:
  - `AuthContext`: Manages JWT persistence, authenticated user role, token decoding, and session expiration checks.
  - `CartContext`: LocalStorage-persisted cart state with optimistic increment/decrement and coupon deduction calculations.

### 2.2 Security on Web Client
- Stored tokens injected via Axios request interceptors (`Authorization: Bearer <token>`).
- Sensitive admin paths protected by client-side guard checks backed by server-side 401/403 rejection.
- All rendered product markdown sanitized against XSS attacks using `DOMPurify`.

---

## 3. Mobile Engineering Specifications (Flutter App)

### 3.1 Architecture Overview
- **Framework**: Flutter 3.38+ / Dart 3.10+ targeting Android (API 26 to 36) and iOS 14+.
- **Package Name**: `com.kalastyle.ai.kala_style_ai_mobile`.
- **Architectural Pattern**: Feature-First + Layered Architecture (Presentation, State, Domain, Infrastructure).
- **State Management**: **Flutter Riverpod** (`StateNotifierProvider`, `Provider`, `FutureProvider`).

### 3.2 Directory Layout
```
mobile/lib/
├── config/
│   ├── api_config.dart        # Platform-aware host resolver (10.0.2.2 vs localhost vs Render production)
│   └── theme.dart             # KalaStyle Material 3 Design System
├── models/                    # Immutable JSON Serializable data models
│   ├── user.dart
│   ├── product.dart
│   ├── order.dart
│   └── artisan_profile.dart
├── providers/                 # Riverpod business logic notifiers
│   ├── auth_provider.dart
│   ├── cart_provider.dart
│   ├── products_provider.dart
│   └── ai_admin_provider.dart
├── routes/
│   └── app_router.dart        # GoRouter configuration with role redirection guards
├── screens/
│   ├── auth/                  # Splash, Login (Phone-First), Register
│   ├── customer/              # Home, ProductDetail, Cart, Checkout, OrderTracking
│   ├── artisan/               # Dashboard, Orders, CameraStudio, AiStudio
│   └── admin/                 # AiAdminScreen with real-time telemetry and chat
└── services/
    ├── api_client.dart        # Dio singleton with JWT interceptor & auto-retry
    ├── auth_service.dart
    ├── product_service.dart
    ├── order_service.dart
    └── ai_service.dart
```

### 3.3 Network Layer (Dio)
- **Base URL Discovery**: `ApiConfig.resolveBaseUrl()` dynamically switches between:
  - Android Emulator: `http://10.0.2.2:5000/api`
  - Local Network / Physical Device: `http://<LAN-IP>:5000/api`
  - Production Cloud: `https://style-heaven-backend.onrender.com/api`
- **Request Interceptor**: Extracts JWT from `SharedPreferences` and attaches `Authorization: Bearer <token>`.
- **Response Error Interceptor**: Automatically parses backend structured error payloads (`{ error: string }`) and handles 401 unauthenticated signals by purging local tokens.

### 3.4 Proguard & Tree-Shaking Configuration
- Tree-shaking enabled for `CupertinoIcons` and `MaterialIcons`, reducing font bundle overhead by 99.4%.
- Compiled with ahead-of-time (AOT) machine code for 60 FPS UI rendering on `arm64-v8a` and `armeabi-v7a`.

---

## 4. Backend Engineering Specifications (Node.js & Express)

### 4.1 Server Middleware Pipeline
Every HTTP request traverses through the following deterministic middleware chain:
```
Request
   │
   ├──> helmet()                            [Sets secure HTTP security headers]
   ├──> cors({ origin: allowedOrigins })    [CORS whitelist validation]
   ├──> express.json({ limit: '10mb' })     [Body parsing with JSON payload bounding]
   ├──> apiLimiter                          [Global IP rate limiting (100 req / 15 min)]
   ├──> authLimiter                         [Auth rate limiting on /login & /register (20 req / 15 min)]
   ├──> Router Dispatch                     [/api/auth, /api/products, /api/orders, /api/ai]
   │       │
   │       ├──> protect                     [JWT Bearer verification & user injection]
   │       └──> authorize('role')           [Strict role-based access check]
   │
   └──> Global Error Handler                [Normalized JSON response with stack suppression in prod]
```

### 4.2 Authentication & Token Specifications
- **Password Hashing**: `bcryptjs` with auto-generated salt of 10 rounds.
- **JWT Signing**:
  - Algorithm: HMAC SHA-256 (`HS256`).
  - Payload: `{ id: user.id }`.
  - Expiry: 7 days (`7d`).
  - Issuer: `kalastyle-api`.
- **Identifier Matching Logic**:
  Supports standard Indian 10-digit mobile numbers while maintaining backward compatibility:
  ```javascript
  const cleanPhone = identifier.replace(/\D/g, '');
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
  const orConditions = [
    `email.eq.${identifier}`,
    `phone.eq.${identifier}`,
    cleanPhone ? `phone.eq.${cleanPhone}` : null,
    cleanPhone ? `phone.eq.+${cleanPhone}` : null,
    last10 ? `phone.eq.${last10}` : null,
    last10 ? `phone.eq.+91${last10}` : null,
    last10 ? `phone.eq.91${last10}` : null,
    cleanPhone ? `email.eq.${cleanPhone}` : null,
  ].filter(Boolean);
  ```

---

## 5. Google Gemini AI Engine Architecture

### 5.1 Multimodal Vision Pipeline (Artisan Studio)
- **Model**: `gemini-1.5-flash` / `gemini-2.0-flash`.
- **Input Parameters**: High-resolution image (via Cloudinary CDN URL or raw image buffer) + artisan contextual prompt.
- **Structured Schema Enforcement**: Prompts mandate deterministic JSON response with strict validation:
  ```json
  {
    "title": "String (<= 70 chars)",
    "description": "String (Markdown supported)",
    "category": "String (Valid enum from taxonomy)",
    "price": "Number (Integer in INR)",
    "tags": ["Array of strings"],
    "craft_technique": "String",
    "cultural_significance": "String"
  }
  ```

### 5.2 Autonomous AI Admin Manager
- **Architecture**: ReAct (Reasoning + Acting) Agent Loop with tool-calling interface (`backend/ai/aiTools.js`).
- **Tool Definitions**:
  1. `get_system_telemetry`:
     - Queries Supabase for: total users, active orders, today's revenue, low-stock items (< 5 units), out-of-stock items, and pending dispatch counts.
  2. `list_low_stock_products`:
     - Returns SKUs requiring artisan restocking notifications.
  3. `recommend_catalog_adjustments`:
     - Cross-references sales volume with inventory age to recommend discounts or featured placement.
  4. `get_order_fulfillment_status`:
     - Audits pending orders and flags bottlenecks where orders are stuck in `placed` or `confirmed` for > 48 hours.
- **Execution Guard**: Write/mutate actions are staged in an `actions_queue` and require manual administrator authorization via the admin console before committing.

---

## 6. Database Technical Schema (Supabase PostgreSQL)

```sql
-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'artisan', 'admin')),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON public.users(phone);
CREATE INDEX idx_users_role ON public.users(role);

-- 2. ARTISAN PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.artisan_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    store_name VARCHAR(255),
    bio TEXT,
    craft_specialty VARCHAR(255),
    upi_id VARCHAR(100),
    upi_qr_code TEXT,
    rating NUMERIC(3,2) DEFAULT 5.0,
    total_sales INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_artisan_user UNIQUE (user_id)
);

-- 3. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artisan_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    images TEXT[] DEFAULT '{}',
    category VARCHAR(100) NOT NULL,
    tags TEXT[] DEFAULT '{}',
    craft_technique VARCHAR(255),
    ai_generated BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_artisan ON public.products(artisan_id);
CREATE INDEX idx_products_stock ON public.products(stock);

-- 4. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(50) DEFAULT 'placed' CHECK (status IN ('placed', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled')),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('razorpay', 'cod', 'upi')),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    shipping_address JSONB NOT NULL,
    tracking_number VARCHAR(100),
    delivery_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- 5. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    price_at_purchase NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- 6. AI ACTIONS & TELEMETRY AUDIT LOG
CREATE TABLE IF NOT EXISTS public.ai_actions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name VARCHAR(100) NOT NULL,
    parameters JSONB,
    result JSONB,
    status VARCHAR(50) DEFAULT 'success',
    executed_by VARCHAR(50) DEFAULT 'autonomous_gemini',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 7. Payment & Cryptographic Verification (Razorpay)

### 7.1 Webhook Cryptographic Verification
Razorpay sends webhook event notifications with signature in header `x-razorpay-signature`. The verification prevents payment spoofing:
```javascript
const crypto = require('crypto');

function verifyRazorpaySignature(bodyString, receivedSignature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(bodyString)
    .digest('hex');

  // Prevent timing attacks via crypto.timingSafeEqual
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(receivedSignature, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
```

### 7.2 Inventory Atomicity on Payment Confirmation
Upon payment confirmation, inventory decrements are executed inside a database transaction or atomic RPC call to prevent overselling race conditions:
```sql
UPDATE public.products
SET stock = stock - sub.quantity,
    updated_at = NOW()
FROM (
    SELECT product_id, quantity 
    FROM public.order_items 
    WHERE order_id = $1
) sub
WHERE public.products.id = sub.product_id
  AND public.products.stock >= sub.quantity;
```

---

## 8. Messaging & Logistics Pipeline (Twilio WhatsApp)

### 8.1 Dispatch Trigger Architecture
When an artisan or admin updates an order's milestone status via `PUT /api/orders/:id/status`, the `orderController` invokes `twilioWhatsAppService.js`:
- **Trigger**: Status transition to `confirmed`, `shipped`, or `delivered`.
- **Recipient Normalization**: Extracts customer phone number, formats with `+91` standard E.164 convention (`whatsapp:+919743772331`).
- **Template Payload**:
  ```text
  Namaste {CustomerName}! 🙏
  Your KalaStyle AI order #{OrderID} has been {StatusText}!
  📦 Items: {ItemsSummary}
  🚚 Tracking: {TrackingNumber}
  Track live in your KalaStyle app: https://kalastyle.ai/track/{OrderID}
  ```
- **Resilience**: Asynchronous non-blocking dispatch wrapped in try/catch to ensure WhatsApp API outages do not fail the core order transaction.

---

## 9. Security, Hardening & Compliance Matrix

| Vulnerability Vector | Threat Scenario | Implemented Defense Mechanism |
| :--- | :--- | :--- |
| **BOLA / IDOR** | Malicious user reads/modifies another user's order | Controllers verify `order.user_id === req.user.id` unless `req.user.role === 'admin'`. |
| **Brute Force** | Dictionary attack on `/api/auth/login` | `express-rate-limit` caps login attempts to 20 per 15 minutes per IP. |
| **Credential Theft** | Database compromise exposing passwords | Passwords stored strictly as `bcryptjs` one-way hashes with 10 salt rounds. |
| **Payment Spoofing**| Manipulating client checkout sheet | Server recalculates order total from DB prices; Razorpay signatures verified with `timingSafeEqual`. |
| **SQL Injection** | Parameterized attack through search filters | Supabase client uses prepared statements exclusively; all queries parameterized. |
| **Prompt Injection**| Malicious product text overriding Gemini behavior | Strict system instructions with role demarcation (`### SYSTEM RULES`) and output JSON schemas. |
| **XSS / HTML Injection**| Stored malicious scripts in product narrative | Markdown rendered through sanitized parser; React JSX auto-escapes string interpolations. |

---

## 10. Operational SLA & Deployment Topology

### 10.1 Production Hosting
- **API Server**: Render Web Service (`https://style-heaven-backend.onrender.com`).
  - Auto-build command: `cd backend && npm install`.
  - Start command: `node server.js`.
  - Node version: `v20.x`.
- **Database**: Supabase Cloud PostgreSQL with connection pooler (`pgbouncer`) on port 6543 / direct port 5432.
- **Media CDN**: Cloudinary image hosting with on-the-fly thumbnail generation (`w_500,f_auto,q_auto`).
- **Mobile Distribution**: Android Release APK (`build/app/outputs/flutter-apk/app-release.apk`) compiled via Gradle with Proguard minification.

### 10.2 CI/CD Workspace Enforcement
In accordance with project workspace governance:
- All features, fixes, and schema adjustments must be verified locally.
- Git staged, committed, and pushed directly to `origin main` to trigger automatic webhook deployment pipelines on Render and Netlify.
