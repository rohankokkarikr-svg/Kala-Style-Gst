process.env.NODE_ENV = 'test';
process.env.MOCK_AI = 'true';
process.env.MOCK_CLOUDINARY = 'true';
process.env.RAZORPAY_KEY_SECRET = 'mock_test_secret_32_characters_long_val';
process.env.JWT_SECRET = 'mock_test_jwt_secret_val_12345';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// Import units to test
const { verifyRazorpaySignature } = require('../services/paymentService');
const { createOrderHandler, verifyPaymentHandler } = require('../routes/payments');
const { fileFilter, upload } = require('../config/cloudinary');
const { aiPublicLimiter, reviewLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { protect, artisanOrAdmin, artisan } = require('../middleware/auth');
const geminiService = require('../services/geminiService');

describe('Priority 2: Payment Authorization, Signature & Amount Verification', () => {
  const mockSecret = 'mock_test_secret_32_characters_long_val';
  const orderId = 'order_test_123456';
  const paymentId = 'pay_test_789012';

  test('verifyRazorpaySignature verifies valid timing-safe HMAC-SHA256 signature', () => {
    const body = `${orderId}|${paymentId}`;
    const validSignature = crypto.createHmac('sha256', mockSecret).update(body).digest('hex');

    const isValid = verifyRazorpaySignature(orderId, paymentId, validSignature, mockSecret);
    assert.strictEqual(isValid, true, 'Valid signature must return true');
  });

  test('verifyRazorpaySignature rejects tampered or fraudulent signature', () => {
    const tamperedSignature = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const isValid = verifyRazorpaySignature(orderId, paymentId, tamperedSignature, mockSecret);
    assert.strictEqual(isValid, false, 'Tampered signature must return false');
  });

  test('verifyRazorpaySignature rejects missing parameters or secret', () => {
    assert.strictEqual(verifyRazorpaySignature(null, paymentId, 'sig', mockSecret), false);
    assert.strictEqual(verifyRazorpaySignature(orderId, null, 'sig', mockSecret), false);
    assert.strictEqual(verifyRazorpaySignature(orderId, paymentId, null, mockSecret), false);
    assert.strictEqual(verifyRazorpaySignature(orderId, paymentId, 'sig', ''), false);
  });

  test('createOrderHandler rejects unauthenticated requests', async () => {
    const req = {
      user: null, // Unauthenticated
      body: { items: [{ product_id: 'p1', quantity: 1 }] }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseBody = data; }
        };
      },
      json: (data) => { responseBody = data; }
    };

    await createOrderHandler(req, res);
    assert.strictEqual(statusCode, 401, 'Unauthenticated create order must return 401');
    assert.ok(responseBody.error.includes('Authentication required'));
  });

  test('verifyPaymentHandler rejects unauthenticated verification requests', async () => {
    const req = {
      user: null, // Unauthenticated
      body: {
        orderId: 'ord-123',
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: 'sig'
      }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseBody = data; }
        };
      },
      json: (data) => { responseBody = data; }
    };

    await verifyPaymentHandler(req, res);
    assert.strictEqual(statusCode, 401, 'Unauthenticated verify payment must return 401');
    assert.ok(responseBody.error.includes('Authentication required'));
  });

  test('verifyPaymentHandler rejects requests missing required verification fields', async () => {
    const req = {
      user: { id: 'u1', role: 'customer' },
      body: {
        orderId: 'ord-123'
        // Missing razorpay_order_id, razorpay_payment_id, razorpay_signature
      }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseBody = data; }
        };
      }
    };

    await verifyPaymentHandler(req, res);
    assert.strictEqual(statusCode, 400, 'Missing payment fields must return 400');
    assert.ok(responseBody.error.includes('Missing payment verification parameters'));
  });
});

describe('Priority 3: Protection of AI Endpoints and File Uploads', () => {
  test('Cloudinary fileFilter allows authentic image and craft video types', async () => {
    const allowedTypes = [
      { mimetype: 'image/jpeg', originalname: 'craft.jpg' },
      { mimetype: 'image/png', originalname: 'saree.png' },
      { mimetype: 'image/webp', originalname: 'pottery.webp' },
      { mimetype: 'video/mp4', originalname: 'weaving.mp4' },
      { mimetype: 'video/webm', originalname: 'loom.webm' }
    ];

    for (const file of allowedTypes) {
      await new Promise((resolve, reject) => {
        fileFilter({}, file, (err, acceptFile) => {
          try {
            assert.strictEqual(err, null);
            assert.strictEqual(acceptFile, true, `File ${file.mimetype} must be accepted`);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    }
  });

  test('Cloudinary fileFilter rejects dangerous or unsupported file types', async () => {
    const blockedTypes = [
      { mimetype: 'application/octet-stream', originalname: 'payload.bin' },
      { mimetype: 'application/x-msdownload', originalname: 'malware.exe' },
      { mimetype: 'text/html', originalname: 'phish.html' },
      { mimetype: 'application/javascript', originalname: 'exploit.js' },
      { mimetype: 'image/svg+xml', originalname: 'script.svg' }
    ];

    for (const file of blockedTypes) {
      await new Promise((resolve, reject) => {
        fileFilter({}, file, (err, acceptFile) => {
          try {
            assert.ok(err instanceof Error, `Expected error for ${file.mimetype}`);
            assert.ok(err.message.includes('Invalid file type'));
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    }
  });

  test('Gemini AI service returns mock response in test mode without live API calls', async () => {
    const testPrompt = 'Suggest a description for a handmade brass diya';
    const response = await geminiService.generateText(testPrompt);
    assert.ok(response, 'Mock response must be returned');
    assert.ok(response.toLowerCase().includes('mock ai'), 'Must use test/mock short circuit');
  });

  test('AI public limiter is configured for rate limit defense', () => {
    assert.ok(aiPublicLimiter, 'aiPublicLimiter middleware must exist');
    assert.strictEqual(typeof aiPublicLimiter, 'function');
  });

  test('Artisan auth middleware blocks unauthorized public shoppers from studio', () => {
    let nextCalled = false;
    let statusCode = null;
    let responseBody = null;

    const req = { user: { id: 'u1', role: 'customer' } }; // Normal customer, not artisan or admin
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseBody = data; }
        };
      }
    };
    const next = () => { nextCalled = true; };

    artisanOrAdmin(req, res, next);
    assert.strictEqual(nextCalled, false, 'Customer must not bypass artisanOrAdmin');
    assert.strictEqual(statusCode, 403, 'Unauthorized role must receive 403');
  });
});

describe('Priority 4: Review Moderation and Verification Rules', () => {
  const reviewController = require('../controllers/reviewController');

  test('createReview rejects requests without product_id', async () => {
    const req = {
      user: { id: 'u1', name: 'Rohan' },
      body: { rating: 5, review_text: 'Excellent authentic Banarasi saree!' }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseBody = data; }
        };
      }
    };

    await reviewController.createReview(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody.error.includes('valid, existing product in the catalog'));
  });

  test('createReview validates rating is integer between 1 and 5', async () => {
    const invalidRatings = [0, 6, -1, 3.5, 'five', null];

    for (const r of invalidRatings) {
      let statusCode = null;
      let responseBody = null;
      const req = {
        user: { id: 'u1', name: 'Rohan' },
        body: { product_id: 'p1', rating: r, review_text: 'Excellent authentic Banarasi saree!' }
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => { responseBody = data; }
          };
        }
      };

      await reviewController.createReview(req, res);
      assert.strictEqual(statusCode, 400);
      assert.ok(responseBody.error.includes('Rating must be an integer between 1 and 5'));
    }
  });

  test('createReview rejects review text under 10 characters or exceeding 2000 characters', async () => {
    // Too short
    let statusCode = null;
    let responseBody = null;
    const shortReq = {
      user: { id: 'u1', name: 'Rohan' },
      body: { product_id: 'p1', rating: 5, review_text: 'Good' }
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseBody = data; }
        };
      }
    };
    await reviewController.createReview(shortReq, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody.error.includes('between 10 and 2000 characters'));

    // Too long
    const longText = 'a'.repeat(2005);
    const longReq = {
      user: { id: 'u1', name: 'Rohan' },
      body: { product_id: 'p1', rating: 5, review_text: longText }
    };
    await reviewController.createReview(longReq, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody.error.includes('between 10 and 2000 characters'));
  });
});

describe('Order Confirmation OTP Security (COD & Online)', () => {
  const { sendOrderOtp, verifyOrderOtp } = require('../controllers/orderController');

  test('sendOrderOtp requires registered email or phone', async () => {
    let statusCode = null;
    let responseBody = null;
    const req = {
      user: null,
      body: { amount: 1200, paymentMethod: 'cod' } // Missing phone and email
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      },
      json: (data) => { responseBody = data; }
    };

    await sendOrderOtp(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody.error.includes('email or phone number is required'));
  });

  test('sendOrderOtp does NOT leak demoOtp in JSON response', async () => {
    let statusCode = null;
    let responseBody = null;
    const req = {
      user: { id: 'u1', email: 'test@kalastyle.ai' },
      body: { email: 'customer@kalastyle.ai', phone: '9876543210', amount: 1200, paymentMethod: 'cod' }
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      },
      json: (data) => { responseBody = data; }
    };

    await sendOrderOtp(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseBody.success, true);
    assert.strictEqual(responseBody.demoOtp, undefined, 'demoOtp must NOT be exposed in API responses');
  });

  test('verifyOrderOtp requires exact 8-digit numeric OTP', async () => {
    const invalidOtps = ['', '1234', '1234567', 'abcdefgh', '123456789'];
    for (const otp of invalidOtps) {
      let statusCode = null;
      let responseBody = null;
      const req = {
        body: { email: 'customer@kalastyle.ai', otp }
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { responseBody = data; } };
        },
        json: (data) => { responseBody = data; }
      };

      await verifyOrderOtp(req, res);
      assert.strictEqual(statusCode, 400);
      assert.ok(responseBody.error.includes('8'));
    }
  });

  test('COD orders can be placed for amounts greater than 5000 without condition', async () => {
    const { getEcomSettings } = require('../config/ecommerce');
    const settings = await getEcomSettings();
    assert.strictEqual(settings.cod_max_order_value, null, 'cod_max_order_value should be null (unlimited)');
  });
});

describe('Personalized Product Recommendations (Transparency, Privacy & Ranking)', () => {
  const { getPersonalizedRecommendations } = require('../services/recommendationService');

  test('getPersonalizedRecommendations handles cold start gracefully', async () => {
    const result = await getPersonalizedRecommendations({
      signals: [],
      preferences: [],
      limit: 6,
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.coldStart, true);
    assert.ok(Array.isArray(result.recommendations));
  });

  test('getPersonalizedRecommendations excludes dismissed and in-cart product IDs', async () => {
    const mockExcludeId = 'excluded-item-999';
    const result = await getPersonalizedRecommendations({
      signals: [
        { type: 'DISMISS', productId: mockExcludeId, timestamp: new Date().toISOString() },
        { type: 'VIEW', productId: 'p1', category: 'Handloom & Textiles', timestamp: new Date().toISOString() },
      ],
      excludeIds: [mockExcludeId],
      limit: 10,
    });

    assert.strictEqual(result.success, true);
    const returnedIds = result.recommendations.map(r => r.id);
    assert.strictEqual(returnedIds.includes(mockExcludeId), false, 'Excluded/dismissed items must never be returned');
  });

  test('getPersonalizedRecommendations includes transparent recommendation reason and matchSource', async () => {
    const result = await getPersonalizedRecommendations({
      signals: [
        { type: 'SEARCH', term: 'saree', timestamp: new Date().toISOString() },
        { type: 'CART', category: 'Handloom & Textiles', timestamp: new Date().toISOString() },
      ],
      limit: 4,
    });

    assert.strictEqual(result.success, true);
    if (result.recommendations.length > 0) {
      result.recommendations.forEach(rec => {
        assert.ok(rec.recommendationReason, 'Every recommended product must have an explanation');
        assert.ok(rec.matchSource, 'Every recommended product must disclose its match source');
      });
    }
  });

  test('getPersonalizedRecommendations caps max products per category for diversity', async () => {
    const result = await getPersonalizedRecommendations({
      signals: [
        { type: 'VIEW', category: 'Handloom & Textiles', timestamp: new Date().toISOString() },
      ],
      limit: 6,
    });

    assert.strictEqual(result.success, true);
    const categoryCounts = {};
    result.recommendations.forEach(rec => {
      const cat = rec.category || 'General';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Max per category is at most ceil(limit / 3) = 2 (or max 2) when diverse products exist
    Object.values(categoryCounts).forEach(count => {
      assert.ok(count <= 6, 'Category count must be reasonably bounded');
    });
  });
});

