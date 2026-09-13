const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('CRITICAL: JWT_SECRET environment variable is not configured. Authentication halted for security.');
  }
  return jwt.sign({ id }, secret, {
    expiresIn: '7d',
    issuer: 'kalastyle-api',
  });
};

// Helper to parse bio for UPI metadata
const parseArtisanUpi = (profile) => {
  if (!profile) return profile;
  let upi_id = profile.upi_id || null;
  let upi_qr_code = profile.upi_qr_code || null;
  let cleanBio = profile.bio || '';
  
  if (cleanBio && cleanBio.includes('__UPI_META__:')) {
    try {
      const parts = cleanBio.split('__UPI_META__:');
      cleanBio = parts[0].trim();
      const meta = JSON.parse(parts[1]);
      if (meta.upi_id) upi_id = meta.upi_id;
      if (meta.upi_qr_code) upi_qr_code = meta.upi_qr_code;
    } catch (e) {}
  }
  return { ...profile, bio: cleanBio, upi_id, upi_qr_code };
};

const formatBioWithUpi = (bio, upi_id, upi_qr_code) => {
  let cleanBio = (bio || '').split('__UPI_META__:')[0].trim();
  if (upi_id || upi_qr_code) {
    const meta = JSON.stringify({ upi_id: upi_id || '', upi_qr_code: upi_qr_code || '' });
    return `${cleanBio} __UPI_META__:${meta}`.trim();
  }
  return cleanBio;
};

exports.parseArtisanUpi = parseArtisanUpi;
exports.formatBioWithUpi = formatBioWithUpi;

exports.register = async (req, res) => {
  try {
    const { name, phone, password, role = 'user', store_name, artisan_type, upi_id, upi_qr_code } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Please provide name, phone number, and password' });
    }

    const validRoles = ['user', 'artisan'];
    const userRole = validRoles.includes(role) ? role : 'user';
    const cleanPhone = phone.replace(/\D/g, '');
    const userEmail = (req.body.email || cleanPhone || phone).trim().toLowerCase();

    // Check if user exists (by email OR phone)
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${userEmail},phone.eq.${cleanPhone},email.eq.${cleanPhone}`)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ error: 'User already exists with this phone number or email' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert([{
        name,
        email: userEmail,
        phone: cleanPhone || phone,
        password: hashedPassword,
        role: userRole,
        status: 'active'
      }])
      .select()
      .single();

    if (error) throw error;

    // If artisan, also create artisan_profiles row with UPI information
    let artisanProfile = null;
    if (userRole === 'artisan') {
      const bioWithUpi = formatBioWithUpi('', upi_id, upi_qr_code);
      const { data: profile, error: profileError } = await supabase
        .from('artisan_profiles')
        .insert([{
          user_id: user.id,
          store_name: store_name || name,
          artisan_type: artisan_type || 'General',
          bio: bioWithUpi,
          verification_status: 'pending'
        }])
        .select()
        .single();
      if (!profileError && profile) {
        artisanProfile = parseArtisanUpi(profile);
        try {
          const { emitEvent } = require('../ai/aiEventBus');
          emitEvent('ARTISAN_REGISTERED', 'artisan', profile.id, {
            store_name: profile.store_name,
            user_id: user.id,
            bio: profile.bio,
            artisan_type: profile.artisan_type,
          });
        } catch (e) {}
      }
    }

    const token = generateToken(user.id);
    delete user.password;

    res.status(201).json({
      user: { ...user, artisan_profile: artisanProfile },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

exports.login = async (req, res) => {
  try {
    const { phone, email, password } = req.body;
    const identifier = (phone || email || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide phone number or email and password' });
    }

    // Find user by phone OR email
    const isEmail = identifier.includes('@');
    let userQuery = supabase.from('users').select('*');

    if (isEmail) {
      userQuery = userQuery.eq('email', identifier.toLowerCase());
    } else {
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
        last10 ? `email.eq.${last10}` : null,
      ].filter(Boolean);
      userQuery = userQuery.or(orConditions.join(','));
    }

    const { data: users, error } = await userQuery.limit(1);
    const user = users && users[0];

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials. Please verify your phone/email and password.' });
    }

    // Check account status
    if (user.status && (user.status === 'blocked' || user.status === 'suspended')) {
      return res.status(403).json({ error: 'Your account has been deactivated or suspended by the administrator.' });
    }

    // Check password (support raw and trimmed passwords to tolerate accidental trailing spaces)
    const isMatch = (await bcrypt.compare(password, user.password)) || 
                    (typeof password === 'string' && await bcrypt.compare(password.trim(), user.password));

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials. Please verify your phone/email and password.' });
    }

    // Normalize role string to prevent whitespace issues
    user.role = (user.role || 'user').trim().toLowerCase();

    // If artisan or admin, fetch artisan profile if one exists
    let artisanProfile = null;
    if (user.role === 'artisan' || user.role === 'admin') {
      const { data: profile } = await supabase
        .from('artisan_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      artisanProfile = profile ? parseArtisanUpi(profile) : null;
    }

    const token = generateToken(user.id);
    delete user.password;

    res.json({
      user: { ...user, artisan_profile: artisanProfile },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

exports.getMe = async (req, res) => {
  try {
    // req.user is set by auth middleware
    const user = { ...req.user };
    user.role = (user.role || 'user').trim().toLowerCase();
    delete user.password;

    let artisanProfile = null;
    if (user.role === 'artisan' || user.role === 'admin') {
      const { data: profile } = await supabase
        .from('artisan_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      artisanProfile = profile ? parseArtisanUpi(profile) : null;
    }

    res.json({ ...user, artisan_profile: artisanProfile });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getRewards = async (req, res) => {
  try {
    const userId = req.user.id;
    const REWARD_THRESHOLD = 10; // 10 items ordered (any category) = 1 free T-shirt (one-time welcome reward)

    // 1. Fetch ALL orders for this user
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, total_price, status, created_at')
      .eq('user_id', userId);

    if (ordersError) throw ordersError;

    // Filter to only delivered orders for rewards progress
    const deliveredOrders = orders.filter(o => o.status === 'delivered');
    const deliveredOrderIds = deliveredOrders.map(o => o.id);
    let totalItemsOrdered = 0;
    let totalSpent = 0;

    if (deliveredOrderIds.length > 0) {
      // 2. Count items only from delivered orders
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('quantity')
        .in('order_id', deliveredOrderIds);

      if (itemsError) throw itemsError;

      items.forEach(item => {
        totalItemsOrdered += (item.quantity || 1);
      });

      // Total spent only from delivered orders (for membership level)
      totalSpent = deliveredOrders.reduce((sum, o) => sum + Number(o.total_price), 0);
    }

    // 3. Reward milestone: 10 items delivered = 90% OFF Super Voucher
    const progress         = Math.min(totalItemsOrdered, REWARD_THRESHOLD);
    const rewardsEarned    = totalItemsOrdered >= REWARD_THRESHOLD ? 1 : 0;
    const needed           = REWARD_THRESHOLD - progress;

    // 4. Auto-provision unique 90% discount reward coupon if milestone reached
    let rewardCode = null;
    let rewardClaimed = false; // true once the coupon has been used at checkout
    let couponCreatedAt = null;

    if (rewardsEarned > 0) {
      // Check if user already has a KALA90 (or legacy) coupon code in database
      const { data: existingCoupons, error: couponFindError } = await supabase
        .from('coupons')
        .select('code, is_used, created_at')
        .eq('user_id', userId)
        .or('code.like.KALA90%,code.like.FREESHIRT10%');

      if (couponFindError) {
        console.error('Error finding existing coupon:', couponFindError);
      }

      if (!existingCoupons || existingCoupons.length === 0) {
        // First time reaching milestone: generate unique KALA90 code and provision 90% discount
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        rewardCode = `KALA90-${randomStr}`;

        const { data: newCoupon, error: couponInsertError } = await supabase
          .from('coupons')
          .insert({
            code: rewardCode,
            discount_type: 'percentage',
            discount_value: 90,
            user_id: userId,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            is_used: false
          })
          .select()
          .single();

        if (couponInsertError) {
          console.error('Error inserting coupon:', couponInsertError);
        } else if (newCoupon) {
          couponCreatedAt = newCoupon.created_at;
        }
        rewardClaimed = false;
      } else {
        // Coupon exists
        rewardCode = existingCoupons[0].code;
        rewardClaimed = existingCoupons[0].is_used === true;
        couponCreatedAt = existingCoupons[0].created_at;
      }
    }

    // 5. Membership Level (based on total amount spent on delivered orders)
    let level = 'Bronze';
    if (totalSpent > 50000)      level = 'Elite';
    else if (totalSpent > 35000) level = 'Diamond';
    else if (totalSpent > 20000) level = 'Gold';
    else if (totalSpent > 5000)  level = 'Silver';

    res.json({
      totalItemsOrdered,
      progress,
      needed,
      rewardsEarned,
      rewardClaimed,          // <-- lets frontend know if the coupon was already used
      totalSpent,
      membershipLevel: level,
      points: Math.floor(totalSpent / 10),
      rewardThreshold: REWARD_THRESHOLD,
      history: [
        { id: 1, title: 'Welcome Craft Reward', date: '2026-05-01', status: 'Redeemed', code: 'WELCOME10' },
        ...(rewardsEarned > 0
          ? [{
              id: 2,
              title: `Grand 90% OFF Milestone Voucher — ${REWARD_THRESHOLD} handicraft items delivered!`,
              date: couponCreatedAt ? couponCreatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
              // Reflect actual DB status: Redeemed if coupon is used, else Available
              status: rewardClaimed ? 'Redeemed' : 'Available',
              code: rewardCode
            }]
          : []
        )
      ]
    });

  } catch (error) {
    console.error('Rewards error:', error);
    res.status(500).json({ error: 'Failed to fetch rewards data' });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const [usersRes, ordersRes] = await Promise.all([
      safeQuery(() =>
        supabase
          .from('users')
          .select('id, name, email, created_at')
      ),
      safeQuery(() =>
        supabase
          .from('orders')
          .select('user_id, total_price, status')
          .in('status', ['delivered', 'Delivered', 'DELIVERED'])
      )
    ]);

    if (usersRes.error) throw usersRes.error;
    if (ordersRes.error) throw ordersRes.error;

    const users = usersRes.data || [];
    const orders = ordersRes.data || [];

    const userSpendMap = {};
    const userOrdersCountMap = {};

    orders.forEach(o => {
      const price = Number(o.total_price) || 0;
      const uid = String(o.user_id);
      userSpendMap[uid] = (userSpendMap[uid] || 0) + price;
      userOrdersCountMap[uid] = (userOrdersCountMap[uid] || 0) + 1;
    });

    const leaderboard = users.map(u => {
      const uIdStr = String(u.id);
      const totalSpent = Math.round(userSpendMap[uIdStr] || 0);
      const totalOrders = userOrdersCountMap[uIdStr] || 0;

      let level = 'Bronze';
      if (totalSpent > 50000)      level = 'Elite';
      else if (totalSpent > 35000) level = 'Diamond';
      else if (totalSpent > 20000) level = 'Gold';
      else if (totalSpent > 5000)  level = 'Silver';

      return {
        id: u.id,
        name: u.name,
        totalSpent,
        totalOrders,
        membershipLevel: level,
        joinedAt: u.created_at
      };
    });

    leaderboard.sort((a, b) => b.totalSpent - a.totalSpent || b.totalOrders - a.totalOrders);

    const currentUserId = req.user?.id ? String(req.user.id) : null;
    const rankedLeaderboard = leaderboard.map((item, index) => ({
      ...item,
      rank: index + 1,
      isCurrentUser: currentUserId ? String(item.id) === currentUserId : false
    }));

    const currentUserItem = rankedLeaderboard.find(item => String(item.id) === currentUserId);

    let nextRankAmountNeeded = 0;
    if (currentUserItem && currentUserItem.rank > 1) {
      const userAbove = rankedLeaderboard[currentUserItem.rank - 2];
      if (userAbove) {
        nextRankAmountNeeded = Math.max(0, userAbove.totalSpent - currentUserItem.totalSpent + 1);
      }
    }

    res.json({
      leaderboard: rankedLeaderboard,
      currentUserRank: currentUserItem ? {
        rank: currentUserItem.rank,
        totalSpent: currentUserItem.totalSpent,
        totalOrders: currentUserItem.totalOrders,
        membershipLevel: currentUserItem.membershipLevel,
        nextRankAmountNeeded
      } : null,
      totalUsers: rankedLeaderboard.length
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard data' });
  }
};


