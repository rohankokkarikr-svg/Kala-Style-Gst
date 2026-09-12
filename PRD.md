# PRODUCT REQUIREMENT DOCUMENT (PRD)

## Project: KalaStyle AI (Style Heaven Mens Wear)
**Tagline:** *From Artisan to Online Store in One Click*  
**Document Version:** 1.0.0 (Production Release)  
**Status:** Approved & Implemented  
**Date:** September 2026  
**Target Platforms:** Web (React.js), Mobile (Flutter Android/iOS), Backend API (Node.js/Express/Supabase)

---

## 1. Executive Summary & Vision

### 1.1 Problem Statement
India is home to over 7 million traditional artisans, handloom weavers, and craftspeople producing authentic, high-value cultural garments and artifacts. However, less than 2% have an active, independent digital storefront due to:
- Complex digital cataloging requirements (writing titles, tags, descriptions in English).
- Onerous onboarding processes (email mandates, complex merchant gateways).
- High operational overhead in order fulfillment, inventory balancing, and tracking.
- Platform monopolies that extract high commission fees while disconnecting artisans from patrons.

### 1.2 Solution: KalaStyle AI
KalaStyle AI solves this friction through an end-to-end, multi-platform e-commerce ecosystem powered by **Google Gemini Multimodal AI**:
1. **Artisan Studio in One Click**: An artisan captures a single photo of a saree, kurta, or craft item on their phone. Google Gemini automatically identifies the weave, craft tradition, fabric, and color, and writes a rich product story, pricing suggestion, and SEO metadata.
2. **Phone-Number-First Access**: Replaces email with 10-digit mobile number authentication across Customer, Artisan, and Admin roles.
3. **Autonomous AI Admin Manager**: A built-in Gemini AI Co-Pilot continuously monitors sales velocity, low-inventory alerts, revenue metrics, order dispatch bottlenecks, and autonomously drafts catalog optimizations with human-in-the-loop controls.
4. **Unified Multi-Platform Experience**: High-performance React web application for desktop patrons and high-framerate Flutter mobile application for on-the-go patrons, artisans in the field, and administrators.

---

## 2. User Personas & Target Audiences

| Persona | Role | Primary Goal | Key Pain Points |
| :--- | :--- | :--- | :--- |
| **Bhavani Devi** | Rural Handloom Artisan | Digitize handwoven garments and receive direct bank/UPI payouts without tech friction. | Non-technical, prefers mobile/camera, does not use email, speaks regional language. |
| **Arjun Mehta** | Modern Fashion Patron | Discover authentic, verifiable Indian artisan menswear & craft fashion with secure payments and live tracking. | Distrusts dropshippers, demands transparency in craftsmanship and fast status updates. |
| **Rohan Kokkari** | Platform Administrator | Oversee multi-artisan catalog quality, verify payouts, monitor order fulfillment, and use AI autonomy to scale. | Manual catalog moderation is slow; requires automated telemetry and AI inventory insights. |

---

## 3. System Architecture & Tech Stack

```
                                  +-------------------------------------------------------+
                                  |                     CLIENT LAYER                      |
                                  +---------------------------+---------------------------+
                                                              |
                                +-----------------------------+-----------------------------+
                                |                                                           |
                                v                                                           v
              +-----------------------------------+                       +-----------------------------------+
              |          WEB APPLICATION          |                       |        MOBILE APPLICATION         |
              |       React 18 + Tailwind CSS     |                       |       Flutter 3.x + Riverpod      |
              |     Vite / Lucide / Context API   |                       |      GoRouter / Dio / Material 3  |
              +-----------------+-----------------+                       +-----------------+-----------------+
                                |                                                           |
                                +-----------------------------+-----------------------------+
                                                              | HTTPS / REST / JSON
                                                              v
                                  +-------------------------------------------------------+
                                  |                     GATEWAY LAYER                     |
                                  |              Node.js (v20+) / Express.js              |
                                  |        Helmet, CORS, Express-Rate-Limit, JWT          |
                                  +---------------------------+---------------------------+
                                                              |
                  +-----------------------+-------------------+-----------------------+-----------------------+
                  |                       |                                           |                       |
                  v                       v                                           v                       v
      +-----------------------+ +--------------------+                    +-----------------------+ +--------------------+
      |       DATABASE        | |   AI ENGINE (LLM)  |                    |    PAYMENTS & MEDIA   | |   NOTIFICATIONS    |
      | Supabase (PostgreSQL) | | Google Gemini API  |                    |  Razorpay (HMAC Sig)  | | Twilio WhatsApp API|
      | Tables, RLS, Storage  | | Vision & Admin Tool|                    |  Cloudinary Media CDN | | Real-time Updates  |
      +-----------------------+ +--------------------+                    +-----------------------+ +--------------------+
```

### 3.1 Technology Matrix
- **Mobile Client**: Flutter 3.x (Dart 3.x), Riverpod State Management, GoRouter Declarative Routing, Dio HTTP with JWT Interceptors, Google Fonts (`Playfair Display`, `Plus Jakarta Sans`).
- **Web Client**: React 18, Vite, Tailwind CSS with Luxury Artisan Theme (Terracotta `#C2410C`, Royal Indigo `#1E1B4B`, Rich Gold `#D97706`), Axios.
- **Backend API**: Node.js, Express.js, JSON Web Tokens (JWT), Bcrypt password hashing, Timing-Safe Signature Verification.
- **Database**: Supabase PostgreSQL 15, Row-Level Policies, Real-time events.
- **AI Brain**: Google Gemini 1.5 Flash / 2.0 API with structured JSON output and autonomous tool execution (`aiTools.js`).
- **Media Services**: Cloudinary REST API with auto-tagging, quality optimization, and WebP transcoding.
- **Payments**: Razorpay API & Webhook handler with SHA-256 HMAC signature verification; Cash on Delivery (COD) mode; Direct Artisan UPI QR.
- **Messaging**: Twilio WhatsApp Business API for order dispatch alerts and customer delivery timelines.

---

## 4. Role-Based Access Control (RBAC)

Authentication is **Phone-Number-First** (`phone` + `password`). Email is entirely optional.

### 4.1 System Roles
1. **`user` (Customer / Patron)**:
   - Browse catalog, filter by craft category, search by textile technique.
   - View high-definition product gallery, artisan origin story, and verified provenance.
   - Add to persistent shopping bag, calculate order breakdown, and checkout.
   - Select Razorpay (Cards, NetBanking, UPI) or Cash on Delivery (COD).
   - Real-time 5-stage interactive delivery tracking timeline (`Placed` ➔ `Confirmed` ➔ `Shipped` ➔ `Out for Delivery` ➔ `Delivered`).
   - Order tracking updates mirrored to mobile WhatsApp via Twilio.

2. **`artisan` (Creator / Weaver)**:
   - Dedicated Artisan Console (`/artisan`).
   - One-Click Camera Studio: snap product photo on mobile, auto-upload to Cloudinary.
   - Instant Gemini AI Product Studio: auto-generates Title, Cultural Narrative, Category, Tags, and Recommended Price in INR.
   - Order fulfillment pipeline: view assigned orders, update packing and dispatch status.
   - Direct UPI configuration: display custom UPI ID and QR code to receive direct payments.
   - Metrics: sales volume, inventory counts, customer ratings.

3. **`admin` (Super-Administrator)**:
   - Dedicated Admin Console (`/admin`).
   - Autonomous AI Admin Manager powered by Google Gemini:
     - Real-time telemetry monitoring (sales trends, revenue, low-stock alerts, pending dispatches).
     - Natural language Co-Pilot chat to audit inventory, trigger catalog updates, and run diagnostic health checks.
     - Autonomous tool-calling framework (`aiTools.js`) with audit logs.
   - User and artisan account management, role escalation, and security audits.

---

## 5. Functional Specifications

### 5.1 Authentication & Profile Management
- **FR-AUTH-01 (Phone-First)**: Users can register and log in using a 10-digit Indian phone number (`^\d{10}$`) and password.
- **FR-AUTH-02 (Legacy Compatibility)**: System accepts standard international format (`+91...`, `91...`) and email identifiers transparently.
- **FR-AUTH-03 (Quick Role Switcher)**: Mobile login screen provides 1-tap demo credentials for rapid testing of `Admin`, `Artisan`, and `Customer` environments.
- **FR-AUTH-04 (JWT Session Management)**: Issued JWT tokens are valid for 7 days with issuer `kalastyle-api`, securely stored in mobile `SharedPreferences` and web `localStorage`.
- **FR-AUTH-05 (Auto-Routing)**: On login, the system automatically redirects users to their role-specific landing screen (`/admin`, `/artisan`, or `/home`).

### 5.2 Customer Storefront & Catalog
- **FR-CAT-01 (Catalog Navigation)**: Grid view with categories: *Handloom Sarees, Kurtas & Menswear, Heritage Jackets, Handcrafted Accessories, Pottery & Decor*.
- **FR-CAT-02 (Search & Filter)**: Instant multi-attribute search across title, description, artisan name, craft technique, and price bounds.
- **FR-CAT-03 (Heritage Product Detail)**: Displays high-res multi-image gallery, artisan bio chip, provenance badge, stock count, and price in INR (`₹`).
- **FR-CAT-04 (Shopping Bag)**: Real-time bag calculation, quantity increments/decrements, item removal, and subtotal calculation with taxes.

### 5.3 Checkout & Payment Pipeline
- **FR-PAY-01 (Razorpay Integration)**: Creates Razorpay server-side order with currency `INR`, returning `order_id` for client checkout sheet.
- **FR-PAY-02 (Timing-Safe Webhook)**: Webhook endpoint validates `x-razorpay-signature` using `crypto.timingSafeEqual` and SHA256 HMAC against `RAZORPAY_KEY_SECRET`.
- **FR-PAY-03 (Cash on Delivery)**: Immediate order creation with `payment_status = 'pending'`, reserved inventory, and COD verification flag.
- **FR-PAY-04 (Stock Decrement)**: Atomic inventory decrement upon successful payment confirmation.

### 5.4 Order Tracking & WhatsApp Messaging
- **FR-ORD-01 (5-Stage State Machine)**: Orders transition through `placed` ➔ `confirmed` ➔ `shipped` ➔ `out_for_delivery` ➔ `delivered`.
- **FR-ORD-02 (Interactive Timeline)**: Visual progress bar on web and mobile with timestamps, delivery partner details, and current milestone.
- **FR-ORD-03 (Twilio WhatsApp Alerts)**: Triggers WhatsApp message to customer's mobile number on critical order milestones (Order Confirmed, Dispatched, Delivered).

### 5.5 Artisan AI Studio (Mobile & Web)
- **FR-ART-01 (Native Camera Capture)**: Direct integration with camera and photo gallery via `image_picker`.
- **FR-ART-02 (Cloudinary CDN Direct Upload)**: Multi-part upload with automatic folder routing (`kalastyle/products`) and HTTPS URL generation.
- **FR-ART-03 (Gemini Multimodal Analysis)**:
  - Input: Image URL + optional artisan voice/text notes.
  - Gemini Output Schema:
    ```json
    {
      "title": "Chanderi Silk Handwoven Kurta with Zari Borders",
      "description": "Crafted by traditional weavers using pure mulberry silk...",
      "category": "Kurtas & Menswear",
      "price": 2899,
      "tags": ["Chanderi", "Handloom", "Silk", "Zari", "Festive"],
      "craft_technique": "Handloom Zari Weaving",
      "estimated_making_time_days": 5
    }
    ```
- **FR-ART-04 (One-Click Publish)**: Artisan can edit any AI-generated field before committing the product to the live Supabase catalog.

### 5.6 Autonomous AI Admin Manager
- **FR-ADM-01 (Gemini AI Brain)**: Autonomous manager powered by Google Gemini API with dedicated system instructions reflecting senior operational manager capabilities.
- **FR-ADM-02 (Telemetry Engine)**: Aggregates real-time stats (Daily GMV, Order Velocity, Low Stock SKU count, Out-of-Stock SKUs, Pending Dispatches).
- **FR-ADM-03 (Autonomous Tool Calling)**:
  - `get_system_telemetry`: queries live database counts and operational metrics.
  - `list_low_stock_products`: surfaces items with inventory below threshold.
  - `recommend_catalog_adjustments`: suggests pricing adjustments based on sales velocity.
  - `get_order_fulfillment_status`: highlights stuck or delayed orders.
- **FR-ADM-04 (Human-in-the-Loop)**: Destructive actions (e.g., price overrides, stock archivals) require explicit admin approval via interactive prompt cards.

---

## 6. Database Schema & Data Models

### 6.1 Entity Relationship Diagram (ERD) Overview
```
+----------------+          +-----------------------+          +-------------------+
|     users      |<---------|   artisan_profiles    |          |    ai_actions     |
+----------------+          +-----------------------+          +-------------------+
| id (UUID, PK)  |          | id (UUID, PK)         |          | id (UUID, PK)     |
| phone (UNIQUE) |          | user_id (FK -> users) |          | tool_name (TEXT)  |
| email (OPT)    |          | store_name (TEXT)     |          | parameters (JSONB)|
| password (HASH)|          | bio (TEXT)            |          | result (JSONB)    |
| role (ENUM)    |          | upi_id (TEXT)         |          | executed_by (TEXT)|
| status (TEXT)  |          | upi_qr_code (TEXT)    |          | created_at (TS)   |
+-------+--------+          +-----------------------+          +-------------------+
        |
        | 1:N
        v
+----------------+          +-----------------------+          +-------------------+
|    products    |<---------|      order_items      |--------->|      orders       |
+----------------+          +-----------------------+          +-------------------+
| id (UUID, PK)  |          | id (UUID, PK)         |          | id (UUID, PK)     |
| artisan_id (FK)|          | order_id (FK -> orders|          | user_id (FK)      |
| title (TEXT)   |          | product_id (FK -> prod|          | total_amount (NUM)|
| description    |          | quantity (INT)        |          | status (ENUM)     |
| price (NUMERIC)|          | price_at_purchase     |          | payment_method    |
| stock (INT)    |          +-----------------------+          | payment_status    |
| images (ARRAY) |                                             | razorpay_order_id |
| category (TEXT)|                                             | shipping_address  |
+----------------+                                             +-------------------+
```

### 6.2 Key Database Tables (PostgreSQL / Supabase)
1. **`users`**: Primary identity table storing phone, email, password hash, role (`user`, `artisan`, `admin`), and status (`active`, `blocked`).
2. **`artisan_profiles`**: Linked 1:1 with `users` of role `artisan`, storing store name, craft lineage bio, rating, UPI ID, and QR code URL.
3. **`products`**: Product catalog items with foreign key to artisan user, pricing, inventory count, tags, Cloudinary image URLs array, and AI generation metadata.
4. **`orders`**: Transaction records containing user reference, total amount, order status (`placed`, `confirmed`, `shipped`, `out_for_delivery`, `delivered`, `cancelled`), payment method (`razorpay`, `cod`), shipping address JSON, and tracking number.
5. **`order_items`**: Line items per order capturing historical price snapshot and quantity.
6. **`ai_actions_log`**: Audit log of all autonomous and human-approved actions executed by the Gemini AI Admin Manager.

---

## 7. Security, Hardening & Compliance

The platform implements comprehensive defense-in-depth across client, API, and database layers:

### 7.1 Application Security
- **Authentication**: Salted Bcrypt (10 rounds) password hashing; strict JWT verification with expiration check.
- **Timing-Safe Payments**: All Razorpay webhooks and payment signatures are compared using `crypto.timingSafeEqual` to eliminate timing attacks.
- **Brute Force Protection**: Express rate limiting (`express-rate-limit`) applied to `/api/auth/login`, `/api/auth/register`, and payment endpoints.
- **Strict Role Authorization**: Middleware layers (`protect`, `authorize('admin')`, `authorize('artisan')`) inspect JWT claims before executing sensitive operations.
- **AI Prompt Injection Guardrails**: System prompts for Google Gemini enforce strict system context boundaries, reject malicious role resets, and sanitize user-provided image captions.
- **CORS & HTTP Headers**: `helmet` security headers configured with restricted CSP, HSTS, and X-Content-Type-Options.

---

## 8. Non-Functional Requirements (NFRs)

| Attribute | Specification | Target Metric |
| :--- | :--- | :--- |
| **API Response Time** | P95 latency for read requests (`/api/products`) | < 200 ms |
| **Mobile Performance** | Frame rate on standard Android devices (API 30+) | Steady 60 FPS |
| **AI Studio Latency** | Full multimodal image analysis & JSON generation | < 4.5 seconds |
| **Availability** | Backend and database uptime | 99.9% |
| **Mobile Footprint** | Release APK size (arm64-v8a) | < 55 MB |
| **Offline Resilience** | Mobile cached catalog via `SharedPreferences` | Instant catalog display on zero-network boot |

---

## 9. API Specification Summary

| Method | Endpoint | Protection | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public (Rate Limited) | Authenticate with Phone/Email + Password |
| `POST` | `/api/auth/register` | Public (Rate Limited) | Register customer or artisan with phone number |
| `GET` | `/api/auth/me` | JWT Required | Fetch current user session profile |
| `GET` | `/api/products` | Public | Paginated, filtered catalog search |
| `POST` | `/api/products` | Artisan / Admin | Create new product catalog item |
| `POST` | `/api/products/upload` | Artisan / Admin | Upload product media to Cloudinary |
| `POST` | `/api/ai/describe-product`| Artisan / Admin | Multimodal Gemini AI product description generator |
| `POST` | `/api/orders` | Customer | Place order with cart items and address |
| `GET` | `/api/orders/my-orders` | Customer | Retrieve customer order history and active trackings |
| `PUT` | `/api/orders/:id/status`| Artisan / Admin | Update milestone delivery stage (triggers WhatsApp) |
| `POST` | `/api/payments/razorpay/order` | Customer | Create Razorpay payment intent order |
| `POST` | `/api/payments/razorpay/verify`| Customer | Verify payment signature and confirm order |
| `GET` | `/api/admin/ai-manager/telemetry`| Admin | Retrieve live system health and telemetry metrics |
| `POST` | `/api/admin/ai-manager/chat` | Admin | Execute Gemini Co-Pilot chat and tool invocations |

---

## 10. Release & Deployment Pipeline

1. **Backend Server**:
   - Hosted on **Render** (`https://style-heaven-backend.onrender.com/api`).
   - Connected directly to GitHub `main` branch with auto-deploy on commit.
2. **Web Frontend**:
   - Deployed on **Netlify** / **Vercel** with continuous deployment.
3. **Mobile Application**:
   - Compiled via Flutter release toolchain (`flutter build apk --release`).
   - Distributed via direct APK streaming over ADB and prepared for Google Play Store upload.
4. **Continuous Integration Rule**:
   - Every completed feature must be staged, committed, and pushed to GitHub `main` per workspace governance rules.

---

## 11. Acceptance Criteria & Sign-Off

- [x] Full Phone-Number-First authentication across Customer, Artisan, and Admin roles without email requirement.
- [x] Verified login credentials working on both Web and Mobile apps.
- [x] Native Flutter release APK built, tested, and running on physical mobile devices.
- [x] Live cloud backend synchronized on Render with real-time Supabase database.
- [x] Google Gemini AI integration active for both Artisan Product Studio and Autonomous AI Admin Manager.
- [x] Razorpay payment processing and Twilio WhatsApp order status messaging operational.
- [x] Complete codebase committed and pushed to GitHub `main` branch.
