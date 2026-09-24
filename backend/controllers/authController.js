const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { normalizeEmail, normalizePhone, normalizeRole, sanitizeUser } = require('../utils/authHelper');

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

    // Admin accounts can NEVER be created via public registration
    const requestedRole = (role || '').toString().trim().toLowerCase();
    if (requestedRole === 'admin' || requestedRole.includes('admin')) {
      return res.status(403).json({ error: 'Administrative accounts cannot be created via public registration.' });
    }

    const userRole = requestedRole === 'artisan' ? 'artisan' : 'user';
    const cleanPhone = normalizePhone(phone);
    const userEmail = normalizeEmail(req.body.email || cleanPhone || phone);

    // Resolve Supabase UID from payload or auth token if present
    let verifiedUid = (typeof req.body.supabase_uid === 'string' && req.body.supabase_uid.trim()) ? req.body.supabase_uid.trim() : null;
    const authHeader = req.headers.authorization;
    const incomingToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.accessToken;
    if (incomingToken) {
      try {
        const { data: { user: sbUser } } = await supabase.auth.getUser(incomingToken);
        if (sbUser?.id) {
          verifiedUid = sbUser.id;
        }
      } catch (_) {}
    }

    // Check if user exists (by email OR phone)
    const { data: existingUsers } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${userEmail},phone.eq.${cleanPhone},email.eq.${cleanPhone}`)
      .limit(5);

    let user = null;
    const existingWithPhone = existingUsers?.find(u => u.phone && u.phone === cleanPhone);
    const existingWithEmail = existingUsers?.find(u => u.email && u.email.toLowerCase() === userEmail);

    if (existingWithPhone && (!existingWithEmail || existingWithPhone.id !== existingWithEmail.id)) {
      return res.status(400).json({ error: 'An account with this phone number already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (existingWithEmail) {
      // If user exists by email but has no phone (e.g. created via OTP session), update it into full account
      if (!existingWithEmail.phone) {
        // Section 13: Never allow public registration to overwrite existing role if it is admin or artisan
        const existingRole = normalizeRole(existingWithEmail.role);
        let preservedRole = existingRole;
        if (existingRole !== 'admin' && existingRole !== 'artisan') {
          preservedRole = userRole;
        }

        const updatePayload = {
          name: name || existingWithEmail.name,
          phone: cleanPhone,
          password: hashedPassword,
          role: preservedRole,
          status: existingWithEmail.status || 'active'
        };
        if (verifiedUid && !existingWithEmail.supabase_uid) {
          updatePayload.supabase_uid = verifiedUid;
        }

        const { data: updatedUser, error: updateErr } = await supabase
          .from('users')
          .update(updatePayload)
          .eq('id', existingWithEmail.id)
          .select()
          .single();

        if (updateErr) throw updateErr;
        user = updatedUser;
      } else {
        return res.status(400).json({ error: 'An account with this email address already exists. Please login instead.' });
      }
    } else {
      // Create user
      const insertPayload = {
        name,
        email: userEmail,
        phone: cleanPhone || phone,
        password: hashedPassword,
        role: userRole,
        status: 'active'
      };
      if (verifiedUid) {
        insertPayload.supabase_uid = verifiedUid;
      }

      const { data: newUser, error } = await supabase
        .from('users')
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;
      user = newUser;
    }

    // If artisan, also create artisan_profiles row with UPI information
    let artisanProfile = null;
    if (userRole === 'artisan') {
      const bioWithUpi = formatBioWithUpi('', upi_id, upi_qr_code);
      const { data: existingProfile } = await supabase
        .from('artisan_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile) {
        const { data: profile } = await supabase
          .from('artisan_profiles')
          .update({
            store_name: store_name || name,
            artisan_type: artisan_type || 'General',
            bio: bioWithUpi,
          })
          .eq('user_id', user.id)
          .select()
          .single();
        artisanProfile = profile ? parseArtisanUpi(profile) : null;
      } else {
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
    const { phone, email, identifier: rawId, emailOrPhone, password } = req.body;
    const identifier = String(rawId || emailOrPhone || phone || email || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide phone number or email and password' });
    }

    // Find user by phone OR email
    const isEmail = identifier.includes('@');
    let userQuery = supabase.from('users').select('*');

    if (isEmail) {
      userQuery = userQuery.ilike('email', normalizeEmail(identifier));
    } else {
      const cleanPhone = normalizePhone(identifier);
      const orConditions = [
        `phone.eq.${cleanPhone}`,
        `phone.eq.+91${cleanPhone}`,
        `phone.eq.91${cleanPhone}`,
        `email.eq.${cleanPhone}`,
        `email.eq.${identifier}`,
        `phone.eq.${identifier}`,
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

    // Normalize role string to canonical user | artisan | admin
    user.role = normalizeRole(user.role);

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
    delete user.password_hash;

    res.json({
      user: { ...user, artisan_profile: artisanProfile },
      token
    });
  } catch (error) {
    console.error('[authController.login] Error:', error);
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

exports.syncSupabaseSession = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'Valid Supabase session token is required to sync session' });
    }

    // Verify token using official Supabase auth.getUser(token)
    let verifiedEmail = null;
    let verifiedUid = null;
    let googleName = null;
    let avatarUrl = null;

    try {
      const { data: { user: sbUser }, error: sbError } = await supabase.auth.getUser(token);
      if (sbError || !sbUser || !sbUser.email) {
        return res.status(401).json({ error: 'Invalid or expired Supabase authentication token' });
      }
      verifiedEmail = normalizeEmail(sbUser.email);
      verifiedUid = sbUser.id;

      // Extract user metadata provided by Supabase / Google OAuth
      const meta = sbUser.user_metadata || {};
      googleName = (meta.full_name || meta.name || meta.display_name || '').trim();
      avatarUrl = meta.avatar_url || meta.picture || null;
    } catch (tokenErr) {
      console.error('[syncSupabaseSession] Token verification error:', tokenErr.message);
      return res.status(401).json({ error: 'Failed to verify Supabase session token' });
    }

    if (!verifiedEmail) {
      return res.status(400).json({ error: 'Verified email is required from Supabase session' });
    }

    // Canonical identity resolution priority:
    // 1. Resolve by verified supabase_uid if present
    // 2. Resolve by normalized verified email
    // 3. Create new public.users record
    let user = null;
    if (verifiedUid) {
      try {
        const { data: userByUid } = await supabase
          .from('users')
          .select('*')
          .eq('supabase_uid', verifiedUid)
          .maybeSingle();
        if (userByUid) {
          user = userByUid;
        }
      } catch (_) {}
    }

    if (!user) {
      const { data: existingUsers } = await supabase
        .from('users')
        .select('*')
        .ilike('email', verifiedEmail)
        .limit(1);
      user = existingUsers && existingUsers[0];
    }

    if (user) {
      if (user.status && (user.status === 'blocked' || user.status === 'suspended')) {
        return res.status(403).json({ error: 'Your account has been deactivated or suspended by the administrator.' });
      }
      // Section 12, 13, 14, 20: Preserve existing role strictly! Never overwrite or downgrade existing role
      user.role = normalizeRole(user.role);

      // Section 11 & 19: Link supabase_uid if present and not yet linked, preventing duplicate ownership
      if (!user.supabase_uid && verifiedUid) {
        try {
          const { data: conflictUser } = await supabase
            .from('users')
            .select('id')
            .eq('supabase_uid', verifiedUid)
            .neq('id', user.id)
            .maybeSingle();

          if (conflictUser) {
            return res.status(409).json({ error: 'This Supabase identity is already linked to another account.' });
          }

          await supabase.from('users').update({ supabase_uid: verifiedUid }).eq('id', user.id);
          user.supabase_uid = verifiedUid;
        } catch (_) {}
      }

      // If user has a placeholder email name and Google provides full name, enhance profile name
      if (googleName && (!user.name || user.name === verifiedEmail.split('@')[0])) {
        try {
          await supabase.from('users').update({ name: googleName }).eq('id', user.id);
          user.name = googleName;
        } catch (_) {}
      }
    } else {
      // Section 15: Create user profile with role 'user' ONLY (never admin or artisan from OAuth)
      const defaultName = googleName || verifiedEmail.split('@')[0] || 'User';
      const crypto = require('crypto');
      const salt = await bcrypt.genSalt(10);
      const randomSecret = crypto.randomBytes(16).toString('hex');
      const placeholderHash = await bcrypt.hash(randomSecret, salt);

      const newUserData = {
        name: defaultName,
        email: verifiedEmail,
        password: placeholderHash,
        role: 'user', // STRICT: Normal user by default
        status: 'active',
      };

      let newUser = null;
      if (verifiedUid) {
        const { data, error } = await supabase
          .from('users')
          .insert([{ ...newUserData, supabase_uid: verifiedUid }])
          .select()
          .single();
        if (!error && data) {
          newUser = data;
        }
      }

      if (!newUser) {
        const { data, error: createErr } = await supabase
          .from('users')
          .insert([newUserData])
          .select()
          .single();

        if (createErr) {
          console.error('Error creating user profile after OAuth:', createErr);
          throw createErr;
        }
        newUser = data;
      }
      user = newUser;
      user.role = 'user';
    }

    // Load artisan profile if artisan or admin
    let artisanProfile = null;
    if (user.role === 'artisan' || user.role === 'admin') {
      const { data: profile } = await supabase
        .from('artisan_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      artisanProfile = profile ? parseArtisanUpi(profile) : null;
    }

    delete user.password;
    delete user.password_hash;
    const backendToken = generateToken(user.id);

    res.json({
      user: { ...user, artisan_profile: artisanProfile },
      token: backendToken
    });
  } catch (error) {
    console.error('Session sync error:', error);
    res.status(500).json({ error: 'Server error during session synchronization' });
  }
};

// Backward-compatible alias for existing OTP flow
exports.syncOtpSession = exports.syncSupabaseSession;



