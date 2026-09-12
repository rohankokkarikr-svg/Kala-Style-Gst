# KalaStyle AI — Google Play Store Metadata & Production Release Guide

## 1. Store Listing Details

- **App Title (Max 30 characters)**:
  `KalaStyle AI: Artisan Crafts`

- **Short Description (Max 80 characters)**:
  `From Artisan to Online Store in One Click. Authentic Indian crafts powered by AI.`

- **Full Description (Up to 4000 characters)**:
  ```text
  KalaStyle AI connects traditional Indian craftspeople directly with global patrons using the power of Google Gemini AI.

  From master weavers in Varanasi to terracotta potters in Bengal, KalaStyle AI empowers rural artisans to digitize, price, and sell their handmade treasures in one single click.

  FOR ARTISANS & CREATORS:
  • One-Click AI Studio: Take a photo of your craft with your camera. Gemini AI automatically analyzes the materials, writes captivating heritage stories, suggests fair market pricing, and detects the craft category.
  • Instant Online Store: Publish directly to the global marketplace with no coding or digital cataloging expertise required.
  • Order Fulfillment: Receive live order notifications, track dispatches, and receive updates directly through WhatsApp.

  FOR PATRONS & BUYERS:
  • 100% Authentic Indian Heritage: Browse curated handloom textiles, terracotta pottery, brass idols, tribal jewelry, and woodcarvings direct from master creators.
  • Direct Artisan Support: Every purchase directly supports the artisan family with fair wage guarantees.
  • Live Order Tracking: Real-time parcel tracking with automated WhatsApp milestone updates.
  • Secure Payments: Integrated UPI, RuPay, credit/debit cards, net banking, and Cash on Delivery (COD).

  FOR STORE ADMINISTRATORS:
  • Autonomous AI Admin Manager: Live telemetry monitoring, automated low-inventory alerts, artisan KYC approvals, and natural language Copilot chat with Google Gemini.

  Empowering cultural heritage. Preserving ancient crafts. Powered by KalaStyle AI.
  ```

## 2. Categorization & Rating

- **Application Category**: Shopping / Lifestyle
- **Content Rating**: Everyone (PEGI 3 / USK 0 / ESRB Everyone)
- **Tags**: Shopping, Crafts, Artisan, Handloom, Indian Heritage, eCommerce, Gemini AI

## 3. Contact & Policy Details

- **Support Email**: support@kalastyle.ai
- **Website**: https://kalastyle.ai
- **Privacy Policy URL**: https://kalastyle.ai/privacy

## 4. Required Graphics Assets Checklist

- [x] **App Icon**: 512 × 512 px 32-bit PNG with alpha
- [ ] **Feature Graphic**: 1024 × 500 px JPG or 24-bit PNG (no alpha)
- [ ] **Phone Screenshots**: Minimum 4 screenshots (1080 × 1920 or 1080 × 2400):
  1. Customer Marketplace with Handcrafted Collections
  2. Artisan One-Click Camera AI Studio
  3. Real-Time Order Tracking & WhatsApp Updates
  4. Autonomous AI Admin Manager Console

## 5. Android Build & Release Commands

To build production Android App Bundle (AAB) for Google Play Console:
```bash
cd mobile
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.kalastyle.ai/api
```
Output artifact: `build/app/outputs/bundle/release/app-release.aab`
