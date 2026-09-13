const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');

// In-memory fallback in case of transient database connection issues
let inMemoryNotifications = [];

/**
 * 1. Fetch notifications for current authenticated user
 * User receives notifications where:
 *   - target_user_id === user.id
 *   - OR target_audience === 'all'
 *   - OR target_audience === 'artisans' (if role === 'artisan')
 *   - OR target_audience === 'customers' (if role === 'user' || 'customer')
 *   - OR target_audience === 'admins' (if role === 'admin')
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || 'user').toLowerCase();

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Build audience filters
    const audienceFilters = ['target_audience.eq.all'];
    if (userRole === 'artisan') {
      audienceFilters.push('target_audience.eq.artisans');
    } else if (userRole === 'admin') {
      audienceFilters.push('target_audience.eq.admins');
    } else {
      audienceFilters.push('target_audience.eq.customers');
    }

    const orFilter = `target_user_id.eq.${userId},${audienceFilters.join(',')}`;

    let notifications = [];

    try {
      const { data, error } = await safeQuery(() =>
        supabase
          .from('notifications')
          .select('*, sender:sender_id(id, name, email, role), target_user:target_user_id(id, name, email, role)')
          .or(orFilter)
          .order('created_at', { ascending: false })
          .limit(50)
      );

      if (error) {
        console.warn('[notificationController] Supabase query error:', error.message);
      } else if (data) {
        notifications = data;
      }
    } catch (dbErr) {
      console.warn('[notificationController] DB query failed, falling back to memory:', dbErr.message);
    }

    // Merge in-memory matching notifications
    const memMatching = inMemoryNotifications.filter(n => {
      if (n.target_user_id === userId) return true;
      if (n.target_audience === 'all') return true;
      if (userRole === 'artisan' && n.target_audience === 'artisans') return true;
      if (userRole === 'admin' && n.target_audience === 'admins') return true;
      if ((userRole === 'user' || userRole === 'customer') && n.target_audience === 'customers') return true;
      return false;
    });

    // Combine & deduplicate by id
    const seen = new Set();
    let combined = [...notifications, ...memMatching].filter(item => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // Sort descending by created_at
    combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // STRICT USER SIDE FILTERING:
    // In user side show ONLY:
    // 1. Admin messages (broadcast or direct to this particular user)
    // 2. Artisan messages if sent specifically to the particular user
    if (userRole === 'user' || userRole === 'customer') {
      combined = combined.filter(n => {
        const senderRole = (n.sender?.role || '').toLowerCase();
        const isFromAdmin = senderRole === 'admin' || !n.sender_id;
        const isDirectFromArtisan = senderRole === 'artisan' && n.target_user_id === userId;
        const isDirectFromAdmin = senderRole === 'admin' && n.target_user_id === userId;
        const isBroadcastFromAdmin = isFromAdmin && (n.target_audience === 'all' || n.target_audience === 'customers');
        return isBroadcastFromAdmin || isDirectFromAdmin || isDirectFromArtisan;
      });
    }

    const unread_count = combined.filter(n => !n.is_read).length;

    res.json({
      success: true,
      notifications: combined,
      unread_count,
      user_id: userId,
      user_role: userRole
    });
  } catch (err) {
    console.error('[getMyNotifications] Error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

/**
 * 2. Send a message / notification
 * Sender: req.user (Customer, Artisan, or Admin)
 * Recipient: Specific User/Artisan (recipient_id) or Admin ('admin') or target_audience
 */
exports.sendMessage = async (req, res) => {
  try {
    const sender = req.user;
    if (!sender) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let { recipient_id, recipient_role, title, message, target_audience } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }

    message = message.trim();
    let targetUserId = recipient_id || null;
    let targetAudience = target_audience || 'specific';

    // Broadcast authorization: Only admin can broadcast to all, artisans, or customers
    if (['all', 'artisans', 'customers'].includes(targetAudience) && (sender.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only platform administrators are permitted to send broadcast notifications.' });
    }

    // 1. If recipient is 'admin' or recipient_role is 'admin'
    if (recipient_id === 'admin' || recipient_role === 'admin') {
      targetAudience = 'admins';
      try {
        const { data: adminUsers } = await supabase
          .from('users')
          .select('id, name')
          .eq('role', 'admin')
          .limit(1);
        if (adminUsers && adminUsers.length > 0) {
          targetUserId = adminUsers[0].id;
        }
      } catch (err) {
        console.warn('[sendMessage] Could not resolve admin user id:', err.message);
      }
      if (!title) {
        title = `Inquiry from ${sender.name || 'User'} (${sender.role || 'customer'})`;
      }
    }

    // 2. If recipient_id might be an artisan_profile id, resolve to user_id
    if (targetUserId && targetUserId !== 'admin') {
      try {
        const { data: artProfile } = await supabase
          .from('artisan_profiles')
          .select('user_id, store_name')
          .eq('id', targetUserId)
          .maybeSingle();

        if (artProfile && artProfile.user_id) {
          targetUserId = artProfile.user_id;
        }
      } catch (err) {
        // Not an artisan_profile ID, assume it is already a users.id
      }
    }

    // Default title if not provided
    if (!title || !title.trim()) {
      if (sender.role === 'admin') {
        title = `Message from Platform Support`;
      } else if (sender.role === 'artisan') {
        title = `Message from Artisan ${sender.name || ''}`;
      } else {
        title = `Message from Customer ${sender.name || ''}`;
      }
    }

    const notifRecord = {
      title: title.trim(),
      message,
      target_audience: targetAudience,
      target_user_id: targetUserId,
      sender_id: sender.id,
      is_read: false,
      created_at: new Date().toISOString()
    };

    let savedNotif = null;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([notifRecord])
        .select('*, sender:sender_id(id, name, email, role), target_user:target_user_id(id, name, email, role)')
        .single();

      if (error) {
        console.warn('[sendMessage] Supabase insert warning:', error.message);
      } else if (data) {
        savedNotif = data;
      }
    } catch (dbErr) {
      console.warn('[sendMessage] DB insert failed:', dbErr.message);
    }

    if (!savedNotif) {
      savedNotif = {
        ...notifRecord,
        id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        sender: {
          id: sender.id,
          name: sender.name,
          role: sender.role,
          email: sender.email
        }
      };
      inMemoryNotifications.unshift(savedNotif);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully! 🚀',
      notification: savedNotif
    });
  } catch (err) {
    console.error('[sendMessage] Error:', err);
    res.status(500).json({ error: 'Failed to send message: ' + (err.message || 'Unknown error') });
  }
};

/**
 * 3. Mark single notification as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Notification ID required' });

    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
    } catch (dbErr) {
      console.warn('[markAsRead] DB update error:', dbErr.message);
    }

    // Update in-memory if present
    const memItem = inMemoryNotifications.find(n => n.id === id);
    if (memItem) memItem.is_read = true;

    res.json({ success: true, id });
  } catch (err) {
    console.error('[markAsRead] Error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

/**
 * 4. Mark all notifications for current user as read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = (req.user?.role || 'user').toLowerCase();
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    // 1. Mark all direct notifications for this user
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('target_user_id', userId);
    } catch (dbErr) {
      console.warn('[markAllAsRead] DB update error:', dbErr.message);
    }

    // 2. Also mark broadcast notifications targeted to this user's role or all
    const audiences = ['all'];
    if (userRole === 'admin') audiences.push('admins');
    else if (userRole === 'artisan') audiences.push('artisans');
    else audiences.push('customers');

    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('target_audience', audiences);
    } catch (dbErr) {
      console.warn('[markAllAsRead] Broadcast DB update error:', dbErr.message);
    }

    // Update in-memory notifications
    inMemoryNotifications.forEach(n => {
      if (n.target_user_id === userId || audiences.includes(n.target_audience)) {
        n.is_read = true;
      }
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    console.error('[markAllAsRead] Error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
};

/**
 * 5. Get available message recipients (Artisans, Admin, Customers)
 */
exports.getRecipients = async (req, res) => {
  try {
    const userRole = (req.user?.role || 'user').toLowerCase();

    // 1. Fetch verified artisans with their user profile
    const { data: artisans } = await safeQuery(() =>
      supabase
        .from('artisan_profiles')
        .select('id, user_id, store_name, specialization, location, profile_image, verification_status')
        .order('store_name', { ascending: true })
        .limit(50)
    );

    // 2. Fetch admin user
    const { data: admins } = await safeQuery(() =>
      supabase
        .from('users')
        .select('id, name, email, role')
        .eq('role', 'admin')
        .limit(2)
    );

    // 3. If caller is admin or artisan, also provide customers
    let customers = [];
    if (userRole === 'admin' || userRole === 'artisan') {
      const { data: custData } = await safeQuery(() =>
        supabase
          .from('users')
          .select('id, name, email, role')
          .in('role', ['user', 'customer'])
          .order('name', { ascending: true })
          .limit(50)
      );
      customers = custData || [];
    }

    res.json({
      success: true,
      admins: admins || [],
      artisans: artisans || [],
      customers
    });
  } catch (err) {
    console.error('[getRecipients] Error:', err);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
};

/**
 * 6. Internal System Notification Helper (called by orderController, reviewController, etc.)
 */
exports.createSystemNotification = async ({ title, message, target_audience = 'all', target_user_id = null, sender_id = null }) => {
  try {
    const record = {
      title,
      message,
      target_audience,
      target_user_id,
      sender_id,
      is_read: false,
      created_at: new Date().toISOString()
    };

    const { data } = await supabase.from('notifications').insert([record]).select().single();
    if (data) return data;
  } catch (err) {
    console.warn('[createSystemNotification] DB insert warning:', err.message);
  }

  const mem = {
    id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    title,
    message,
    target_audience,
    target_user_id,
    sender_id,
    is_read: false,
    created_at: new Date().toISOString()
  };
  inMemoryNotifications.unshift(mem);
  return mem;
};

