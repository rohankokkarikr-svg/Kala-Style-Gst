const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });
const supabase = require('../config/supabase');

async function testAllTables() {
  console.log('🧪 Starting Table Insertion & Storage Test on Supabase...');
  console.log('Target URL:', process.env.SUPABASE_URL);

  const results = {};

  // 1. Test USERS table (Customer)
  try {
    const testUser = {
      name: 'Test Customer DB Check',
      email: `test_customer_${Date.now()}@kalastyle.com`,
      phone: '9876543210',
      password: '$2a$10$abcdefghijklmnopqrstuuEXAMPLEHASH',
      role: 'user',
      status: 'active'
    };
    const { data: user, error } = await supabase.from('users').insert([testUser]).select().single();
    if (error) {
      results['users (user)'] = { status: 'FAIL', error: error.message, code: error.code, details: error.details };
    } else {
      results['users (user)'] = { status: 'OK', id: user.id };
      
      // Test ARTISAN PROFILES table
      try {
        const artisanProfile = {
          user_id: user.id,
          store_name: 'Test Kala Studio',
          artisan_type: 'Weaver',
          bio: 'Master weaver handcrafted test profile',
          verification_status: 'approved'
        };
        const { data: profile, error: artError } = await supabase.from('artisan_profiles').insert([artisanProfile]).select().single();
        if (artError) {
          results['artisan_profiles'] = { status: 'FAIL', error: artError.message, code: artError.code };
        } else {
          results['artisan_profiles'] = { status: 'OK', id: profile.id };
          
          // Test ARTISAN EARNINGS
          try {
            const { data: earn, error: earnErr } = await supabase.from('artisan_earnings').insert([{
              artisan_id: profile.id,
              total_earnings: 1500,
              available_balance: 1500
            }]).select().single();
            results['artisan_earnings'] = earnErr ? { status: 'FAIL', error: earnErr.message } : { status: 'OK', id: earn?.id };
          } catch (e) {
            results['artisan_earnings'] = { status: 'FAIL', error: e.message };
          }
        }
      } catch (e) {
        results['artisan_profiles'] = { status: 'FAIL', error: e.message };
      }

      // Test ADMIN creation in USERS
      try {
        const adminUser = {
          name: 'Super Admin Test',
          email: `test_admin_${Date.now()}@kalastyle.com`,
          phone: '9876543219',
          password: '$2a$10$abcdefghijklmnopqrstuuEXAMPLEHASH',
          role: 'admin',
          status: 'active'
        };
        const { data: admin, error: adminErr } = await supabase.from('users').insert([adminUser]).select().single();
        results['users (admin)'] = adminErr ? { status: 'FAIL', error: adminErr.message, code: adminErr.code } : { status: 'OK', id: admin.id };
      } catch (e) {
        results['users (admin)'] = { status: 'FAIL', error: e.message };
      }

      // Test PRODUCTS table
      let productId = null;
      try {
        const testProduct = {
          name: 'Handcrafted Cotton Silk Kurta Test',
          description: 'Authentic handwoven kurta test',
          price: 1999,
          original_price: 2499,
          category: 'Men',
          stock_quantity: 50,
          is_in_stock: true,
          image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500',
          images: ['https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500']
        };
        const { data: prod, error: prodErr } = await supabase.from('products').insert([testProduct]).select().single();
        if (prodErr) {
          results['products'] = { status: 'FAIL', error: prodErr.message, code: prodErr.code };
        } else {
          productId = prod.id;
          results['products'] = { status: 'OK', id: prod.id };
        }
      } catch (e) {
        results['products'] = { status: 'FAIL', error: e.message };
      }

      // Test ORDERS table
      let orderId = null;
      try {
        const testOrder = {
          user_id: user.id,
          total_price: 1999,
          discount_amount: 0,
          shipping_address: '123 Heritage Lane, Bengaluru, Karnataka, 560001',
          phone: '9876543210',
          status: 'pending'
        };
        const { data: ord, error: ordErr } = await supabase.from('orders').insert([testOrder]).select().single();
        if (ordErr) {
          results['orders'] = { status: 'FAIL', error: ordErr.message, code: ordErr.code };
        } else {
          orderId = ord.id;
          results['orders'] = { status: 'OK', id: ord.id };

          // Test ORDER_ITEMS table
          if (productId) {
            try {
              const testItem = {
                order_id: orderId,
                product_id: productId,
                quantity: 1,
                price_at_time: 1999,
                size: 'M'
              };
              const { data: item, error: itemErr } = await supabase.from('order_items').insert([testItem]).select().single();
              results['order_items'] = itemErr ? { status: 'FAIL', error: itemErr.message } : { status: 'OK', id: item.id };
            } catch (e) {
              results['order_items'] = { status: 'FAIL', error: e.message };
            }
          }
        }
      } catch (e) {
        results['orders'] = { status: 'FAIL', error: e.message };
      }

      // Test REVIEWS table
      try {
        const testReview = {
          user_id: user.id,
          product_name: 'Handcrafted Cotton Silk Kurta Test',
          customer_name: 'Test Customer',
          rating: 5,
          review_text: 'Magnificent handloom quality!',
          is_approved: true
        };
        const { data: rev, error: revErr } = await supabase.from('reviews').insert([testReview]).select().single();
        results['reviews'] = revErr ? { status: 'FAIL', error: revErr.message } : { status: 'OK', id: rev.id };
      } catch (e) {
        results['reviews'] = { status: 'FAIL', error: e.message };
      }

      // Test COUPONS table
      try {
        const testCoupon = {
          code: `TESTPROMO${Date.now().toString().slice(-4)}`,
          discount_type: 'percentage',
          discount_value: 15,
          expiry_date: new Date(Date.now() + 86400000).toISOString(),
          is_used: false,
          user_id: user.id
        };
        const { data: coup, error: coupErr } = await supabase.from('coupons').insert([testCoupon]).select().single();
        results['coupons'] = coupErr ? { status: 'FAIL', error: coupErr.message } : { status: 'OK', id: coup.id };
      } catch (e) {
        results['coupons'] = { status: 'FAIL', error: e.message };
      }

      // Test USER_SPINS table
      try {
        const testSpin = {
          user_id: user.id,
          last_spin_date: new Date().toISOString()
        };
        const { data: spin, error: spinErr } = await supabase.from('user_spins').insert([testSpin]).select().single();
        results['user_spins'] = spinErr ? { status: 'FAIL', error: spinErr.message } : { status: 'OK', id: spin.id };
      } catch (e) {
        results['user_spins'] = { status: 'FAIL', error: e.message };
      }

      // Test NOTIFICATIONS table
      try {
        const testNotif = {
          user_id: user.id,
          title: 'Welcome to KalaStyle',
          message: 'Your account is ready',
          type: 'welcome',
          is_read: false
        };
        const { data: notif, error: notifErr } = await supabase.from('notifications').insert([testNotif]).select().single();
        results['notifications'] = notifErr ? { status: 'FAIL', error: notifErr.message } : { status: 'OK', id: notif.id };
      } catch (e) {
        results['notifications'] = { status: 'FAIL', error: e.message };
      }

      // Test SALES table
      try {
        const testSale = {
          product_name: 'Handcrafted Cotton Silk Kurta Test',
          quantity: 1,
          unit_price: 1999,
          total_amount: 1999,
          sale_type: 'online_order'
        };
        const { data: sale, error: saleErr } = await supabase.from('sales').insert([testSale]).select().single();
        results['sales'] = saleErr ? { status: 'FAIL', error: saleErr.message } : { status: 'OK', id: sale.id };
      } catch (e) {
        results['sales'] = { status: 'FAIL', error: e.message };
      }

      // Test CHECKOUT_OTP_CHALLENGES table
      try {
        const testOtp = {
          phone: '9876543210',
          otp_hash: 'test_hash',
          attempts: 0,
          expires_at: new Date(Date.now() + 600000).toISOString()
        };
        const { data: ch, error: chErr } = await supabase.from('checkout_otp_challenges').insert([testOtp]).select().single();
        results['checkout_otp_challenges'] = chErr ? { status: 'FAIL', error: chErr.message } : { status: 'OK', id: ch?.id || 'ok' };
      } catch (e) {
        results['checkout_otp_challenges'] = { status: 'FAIL', error: e.message };
      }

      // Test REPORTS table
      try {
        const testReport = {
          report_type: 'product',
          target_id: productId || 'prod_123',
          reporter_id: user.id,
          reason: 'Quality Test',
          description: 'Testing reports storage in Supabase',
          status: 'open'
        };
        const { data: rep, error: repErr } = await supabase.from('reports').insert([testReport]).select().single();
        results['reports'] = repErr ? { status: 'FAIL', error: repErr.message } : { status: 'OK', id: rep.id };
      } catch (e) {
        results['reports'] = { status: 'FAIL', error: e.message };
      }
    }
  } catch (e) {
    results['users (user)'] = { status: 'FAIL', error: e.message };
  }

  console.log('\n📊 STORAGE TEST RESULTS:');
  console.log(JSON.stringify(results, null, 2));
}

testAllTables();
