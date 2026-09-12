# KalaStyle AI — Comprehensive Security Policy & Architecture

## 1. Overview & Defense-in-Depth Architecture

KalaStyle AI employs a rigorous defense-in-depth security model. The fundamental axiom across the platform is:
> **FRONTEND IS UNTRUSTED • AI IS AN UNTRUSTED OPERATIONAL BRAIN • BACKEND IS THE SOLE ENFORCEMENT LAYER • SECRETS REMAIN SERVER-SIDE ONLY**

```
Browser / Mobile Client
       │
   HTTPS / TLS (HSTS: max-age=31536000)
       │
   Strict Security Headers (Helmet CSP, Anti-Frame DENY, nosniff)
       │
   Strict CORS (Restricted to verified production domains)
       │
   Rate Limiting (express-rate-limit: auth, AI, orders, uploads)
       │
   Authentication & JWT Verification (Short-lived, algorithm-pinned)
       │
   Role-Based Access Control (CUSTOMER, ARTISAN, ADMIN, AI_SYSTEM)
       │
   Server-Side Input Validation & Sanitization (Anti-XSS, anti-injection)
       │
   Business Rules & Atomic Stock (Conditional gte non-negative inventory)
       │
   External Service Connectors (Supabase, Razorpay, Cloudinary, Twilio, Gemini)
       │
   Immutable Audit Logs (ai_admin_actions, activity logs)
```

---

## 2. Environment Secrets & Zero-Leakage Guarantee

All sensitive operational secrets are isolated strictly on the backend and are loaded via environment variables:
- `GEMINI_ADMIN_API_KEY` / `GEMINI_API_KEY`
- `SUPABASE_SERVICE_KEY`
- `JWT_SECRET`
- `RAZORPAY_KEY_SECRET`
- `TWILIO_AUTH_TOKEN`
- `CLOUDINARY_API_SECRET`

### Secret Protection Controls:
1. **Source Code Audited**: Zero hardcoded credentials or fallback keys exist anywhere in application code.
2. **Git Ignore Protection**: `.gitignore` strictly ignores all `.env*`, `*.local`, `backend/.env.*`, and `frontend/.env.*`.
3. **Response DTO Sanitization**: `req.user` automatically strips `password` and `password_hash` before handling downstream. Internal database errors and stack traces are suppressed in production.
4. **Client Exposure Prohibited**: Frontend bundle verified 100% free of backend secrets.

---

## 3. Authentication & JWT Security

- **Password Hashing**: Salted BCrypt (10 rounds). Plaintext passwords are never persisted or logged.
- **Password Strength**: Minimum 8 characters required on registration.
- **Anti-Enumeration**: Authentication endpoints return uniform, non-distinguishing credentials errors (`"Invalid credentials"`).
- **Token Signing**: JWT tokens signed strictly with `process.env.JWT_SECRET`, issuer `kalastyle-api`, and 7-day expiration.
- **No Client Privilege Trust**: `role` and `id` are extracted strictly from verified token payloads; client-supplied roles in request bodies are ignored.

---

## 4. Role-Based Access Control & IDOR / BOLA Prevention

| Role | Permissions |
| :--- | :--- |
| **CUSTOMER** | View public catalog, manage own cart, checkout, view own orders, submit reviews on purchased items, spin reward wheel (rate-limited). |
| **ARTISAN** | Manage own profile, manage own products, view own sub-orders (`artisan_orders`), update sub-order fulfillment status. **Cannot** view other artisans' orders, edit other artisans' products, or modify master order status. |
| **ADMIN** | Manage platform configuration, approve/reject artisan registrations, verify/reject products, review audit logs, trigger refunds, view global sales. |
| **AI_SYSTEM** | Autonomous operations manager running inside backend tools via strict parameter schemas. **Never** possesses raw SQL access, command execution, or file access. |

### Object-Level Authorization (IDOR Defenses):
- **Products**: `updateProduct` and `deleteProduct` verify `product.artisan_id === callerArtisanProfile.id`.
- **Orders**: Customers can only view and cancel orders where `order.user_id === req.user.id`.
- **Artisan Sub-Orders**: Artisans can only view and update line items and orders matching their `artisan_id`.
- **Sales Metrics**: `/api/sales/daily` and `/api/sales/summary` restricted to `admin`; `/api/sales/scan` restricted to `artisanOrAdmin`.

---

## 5. Payment & Stock Protection (Razorpay & Atomic Inventory)

1. **Server-Side Price Calculation**: Order totals are calculated from the database catalog snapshots; frontend-submitted prices are ignored.
2. **Timing-Safe HMAC Verification**: Razorpay signatures (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) verified using `crypto.timingSafeEqual` against `RAZORPAY_KEY_SECRET`.
3. **Cross-Order Spoofing Prevention**: Payment verification validates that the verified `razorpay_order_id` matches the target internal order.
4. **Webhook Security**: Webhook endpoints fail closed when `RAZORPAY_WEBHOOK_SECRET` is configured and signature is missing or invalid.
5. **Atomic Stock Decrement**: Inventory is conditionally updated with `gte('stock_quantity', quantity)` to prevent overselling and race conditions.
6. **Checkout Idempotency**: Double submissions within 5 seconds for the same user and cart are deduplicated.

---

## 6. AI & Prompt Injection Safeguards (Google Gemini Brain)

1. **Proxy Abuse Protection**: Public cannot call Gemini directly. All generation endpoints require authentication (`protect`) and are throttled with `aiLimiter`.
2. **Prompt Injection Resistance**: System prompt designates all product titles, descriptions, reviews, artisan bios, and customer notes as passive untrusted data.
3. **No Arbitrary SQL / Code Execution**: AI is confined strictly to predefined structured tools (`aiTools.js`). Arbitrary SQL functions (`execute_sql`, `run_query`) do not exist.
4. **Action Confirmation & Audit Logging**: Every autonomous decision is recorded in the immutable `ai_admin_actions` audit table.

---

## 7. Upload & Content Security (Cloudinary & Reviews)

1. **MIME Whitelisting**: Multer memory storage allows only `image/jpeg`, `image/jpg`, `image/png`, `image/webp`.
2. **Anti-XSS**: `.svg` and `application/octet-stream` uploads are rejected to prevent Stored XSS.
3. **Upload Rate Limiting**: Max 8 uploads per minute per IP. Max file size: 10MB.
4. **Review Sanitization**: Strip HTML/script tags from review text. Prevent duplicate reviews per user/product. Require verified purchase for auto-approval.

---

## 8. Incident Response & Vulnerability Reporting

If you discover a potential security vulnerability in KalaStyle AI, please report it immediately:
- **Email**: `security@kalastyle.in`
- **Response SLA**: Within 24 hours
- Please include reproduction steps, affected endpoints, and impact assessment.
