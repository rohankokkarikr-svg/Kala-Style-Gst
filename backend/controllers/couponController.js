const supabase = require('../config/supabase');

/**
 * Probabilities:
 * 5% OFF: 35%
 * 10% OFF: 25%
 * ₹100 OFF: 15%
 * Free Shipping: 10%
 * 20% OFF: 5%
 * Better Luck Next Time: 10%
 */
const rewards = [
  { label: '5% OFF', value: 5, type: 'percentage', chance: 35 },
  { label: '10% OFF', value: 10, type: 'percentage', chance: 25 },
  { label: '₹100 OFF', value: 100, type: 'fixed', chance: 15 },
  { label: 'Free Delivery', value: 0, type: 'free_shipping', chance: 10 },
  { label: '20% OFF', value: 20, type: 'percentage', chance: 5 },
  { label: 'Better Luck Next Time', value: null, type: 'none', chance: 10 },
];

const generateCouponCode = (type, value) => {
  const prefix = 'KALA';
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  if (type === 'percentage') return `${prefix}${value}${random}`;
  if (type === 'fixed') return `${prefix}CASH${random}`;
  if (type === 'free_shipping') return `${prefix}SHIP${random}`;
  return null;
};

exports.spinWheel = async (req, res) => {
  try {
    const userId = req.user.id; // Correctly get ID from req.user set by auth middleware

    // 1. Check if user has already spun recently (e.g., today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: lastSpin, error: spinError } = await supabase
      .from('user_spins')
      .select('last_spin_date')
      .eq('user_id', userId)
      .single();

    if (lastSpin) {
      const lastSpinDate = new Date(lastSpin.last_spin_date);
      lastSpinDate.setHours(0, 0, 0, 0);
      
      if (lastSpinDate.getTime() === today.getTime()) {
        return res.status(400).json({ error: 'You have already spun the wheel today. Come back tomorrow!' });
      }
    }

    // 2. Determine reward based on probabilities
    const random = Math.random() * 100;
    let cumulative = 0;
    let reward = rewards[rewards.length - 1]; // Default to last

    for (const r of rewards) {
      cumulative += r.chance;
      if (random <= cumulative) {
        reward = r;
        break;
      }
    }

    // 3. If reward is not "Better Luck Next Time", generate coupon
    let coupon = null;
    if (reward.type !== 'none') {
      const code = generateCouponCode(reward.type, reward.value);
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7); // Valid for 7 days

      const { data: newCoupon, error: couponError } = await supabase
        .from('coupons')
        .insert({
          code,
          discount_type: reward.type,
          discount_value: reward.value,
          user_id: userId,
          expiry_date: expiry.toISOString(),
          is_used: false
        })
        .select()
        .single();

      if (couponError) throw couponError;
      coupon = newCoupon;
    }

    // 4. Update/Insert user spin record
    const { error: updateSpinError } = await supabase
      .from('user_spins')
      .upsert({ 
        user_id: userId, 
        last_spin_date: new Date().toISOString() 
      }, { onConflict: 'user_id' });

    if (updateSpinError) throw updateSpinError;

    res.json({
      success: true,
      reward: reward.label,
      coupon: coupon ? {
        code: coupon.code,
        expiry: coupon.expiry_date
      } : null
    });

  } catch (error) {
    console.error('Error spinning wheel:', error);
    
    // Check if it's a 'table not found' error (PostgreSQL error code 42P01)
    if (error.code === '42P01') {
      return res.status(500).json({ 
        error: 'Database tables missing. Please run the SQL provided in the implementation plan to create "coupons" and "user_spins" tables.' 
      });
    }
    
    res.status(500).json({ error: error.message || 'Failed to spin wheel' });
  }
};

exports.validateCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('is_used', false)
      .single();

    if (couponError || !coupon) {
      return res.status(404).json({ error: 'Invalid or expired coupon code' });
    }

    // Check if it belongs to the user
    if (coupon.user_id !== userId) {
      return res.status(403).json({ error: 'This coupon code does not belong to you' });
    }

    // Check expiry
    if (new Date(coupon.expiry_date) < new Date()) {
      return res.status(400).json({ error: 'Coupon code has expired' });
    }

    res.json({
      success: true,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    
    if (error.code === '42P01') {
      return res.status(500).json({ error: 'Coupon tables not found in database.' });
    }
    
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
};

exports.getMyCoupons = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('user_id', userId)
      .eq('is_used', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
};
