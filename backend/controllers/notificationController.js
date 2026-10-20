const supabase = require('../config/supabase');
const { safeQuery } = require('../config/supabase');
const { broadcastSync } = require('../utils/realtime');

// UUID v4 format verification regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val.trim());

// In-memory fallback buffer in case of transient database connection issues
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
        console.warn('[notificationController] Supabase query warning:', error.message);
        // Fallback without joins if schema cache or relations hiccup
        const { data: fallbackData } = await safeQuery(() =>
          supabase
            .from('notifications')
            .select('*')
            .or(orFilter)
            .order('created_at', { ascending: false })
            .limit(50)
        );
        if (fallbackData) {
          notifications = fallbackData;
        }
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

    // STRICT USER / CUSTOMER SIDE FILTERING:
    // In user side show:
    // 1. Direct messages specifically addressed to this user (target_user_id === userId) - always shown
    // 2. Broadcasts from admin intended for 'all' or 'customers'
    if (userRole === 'user' || userRole === 'customer') {
      combined = combined.filter(n => {
        if (n.target_user_id === userId) return true;
        const isCustomerBroadcast = n.target_audience === 'all' || n.target_audience === 'customers';
        const senderRole = (n.sender?.role || '').toLowerCase();
        const isFromAdmin = senderRole === 'admin' || !n.sender_id;
        return isCustomerBroadcast && isFromAdmin;
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
    let targetUserId = recipient_id ? String(recipient_id).trim() : null;
    let targetAudience = target_audience ? String(target_audience).trim() : null;

    // Broadcast authorization: Only admin can broadcast to all, artisans, or customers
    if (targetAudience && ['all', 'artisans', 'customers'].includes(targetAudience) && (sender.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only platform administrators are permitted to send broadcast notifications.' });
    }

    // 1. Handle messages targeted to admin
    if (targetUserId === 'admin' || recipient_role === 'admin' || targetAudience === 'admins') {
      targetAudience = 'admins';
      targetUserId = null; // Reset string 'admin' so it doesn't fail UUID validation

      try {
        const { data: adminUsers } = await safeQuery(() =>
          supabase
            .from('users')
            .select('id, name')
            .eq('role', 'admin')
            .limit(1)
        );
        if (adminUsers && adminUsers.length > 0 && isValidUuid(adminUsers[0].id)) {
          targetUserId = adminUsers[0].id;
        }
      } catch (err) {
        console.warn('[sendMessage] Could not resolve admin user id:', err.message);
      }

      if (!title || !title.trim()) {
        title = `Inquiry from ${sender.name || 'User'} (${sender.role || 'customer'})`;
      }
    }

    // 2. If targetUserId is provided, validate & resolve if it's an artisan_profile id
    if (targetUserId) {
      if (!isValidUuid(targetUserId)) {
        console.warn(`[sendMessage] Non-UUID recipient_id "${targetUserId}" provided; resetting to null`);
        targetUserId = null;
      } else {
        // Check if targetUserId is an artisan_profile.id and needs resolution to user_id
        try {
          const { data: artProfile } = await supabase
            .from('artisan_profiles')
            .select('user_id, store_name')
            .eq('id', targetUserId)
            .maybeSingle();

          if (artProfile && isValidUuid(artProfile.user_id)) {
            targetUserId = artProfile.user_id;
          }
        } catch (_) {}

        // Verify targetUserId exists in users table to prevent FK constraint failure
        try {
          const { data: targetUser } = await supabase
            .from('users')
            .select('id')
            .eq('id', targetUserId)
            .maybeSingle();

          if (!targetUser) {
            console.warn(`[sendMessage] Target user ${targetUserId} not found in users table, clearing target_user_id`);
            targetUserId = null;
          }
        } catch (_) {
          targetUserId = null;
        }
      }
    }

    // Ensure targetAudience is valid and never null (schema constraint: VARCHAR(50) NOT NULL)
    if (!targetAudience) {
      targetAudience = targetUserId ? 'specific' : 'all';
    }

    // Default title if not provided
    if (!title || !title.trim()) {
      if (sender.role === 'admin') {
        title = 'Message from Platform Support';
      } else if (sender.role === 'artisan') {
        title = `Message from Artisan ${sender.name || ''}`.trim();
      } else {
        title = `Message from Customer ${sender.name || ''}`.trim();
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
      // First attempt: insert with joins
      const { data, error } = await safeQuery(() =>
        supabase
          .from('notifications')
          .insert([notifRecord])
          .select('*, sender:sender_id(id, name, email, role), target_user:target_user_id(id, name, email, role)')
          .single()
      );

      if (error) {
        console.warn('[sendMessage] Supabase joined insert error:', error.message || error);
        // Fallback attempt: plain insert without joins
        const { data: plainData, error: plainErr } = await safeQuery(() =>
          supabase
            .from('notifications')
            .insert([notifRecord])
            .select()
            .single()
        );

        if (plainErr) {
          console.error('[sendMessage] Plain insert error:', plainErr.message || plainErr);
        } else if (plainData) {
          savedNotif = {
            ...plainData,
            sender: {
              id: sender.id,
              name: sender.name,
              role: sender.role,
              email: sender.email
            }
          };
        }
      } else if (data) {
        savedNotif = data;
      }
    } catch (dbErr) {
      console.error('[sendMessage] DB insert exception:', dbErr.message);
    }

    // Fallback to in-memory only if database insertion completely failed
    if (!savedNotif) {
      console.warn('[sendMessage] Saving notification to in-memory buffer as DB fallback');
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

    // Broadcast multi-device real-time sync event so recipient's browser updates immediately
    try {
      broadcastSync('NOTIFICATION_RECEIVED', {
        notification: savedNotif,
        target_user_id: targetUserId,
        target_audience: targetAudience,
        sender_id: sender.id
      });
    } catch (syncErr) {
      console.warn('[sendMessage] Realtime broadcast warning:', syncErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully! 🚀',
      notification: savedNotif
    });
  } catch (err) {
    console.error('[sendMessage] Fatal error:', err);
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
      await safeQuery(() =>
        supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', id)
      );
    } catch (dbErr) {
      console.warn('[markAsRead] DB update error:', dbErr.message);
    }

    // Update in-memory if present
    const memItem = inMemoryNotifications.find(n => n.id === id);
    if (memItem) memItem.is_read = true;

    try {
      broadcastSync('NOTIFICATION_READ', { id, userId: req.user?.id });
    } catch (_) {}

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
      await safeQuery(() =>
        supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('target_user_id', userId)
      );
    } catch (dbErr) {
      console.warn('[markAllAsRead] DB update error:', dbErr.message);
    }

    // 2. Also mark broadcast notifications targeted to this user's role or all
    const audiences = ['all'];
    if (userRole === 'admin') audiences.push('admins');
    else if (userRole === 'artisan') audiences.push('artisans');
    else audiences.push('customers');

    try {
      await safeQuery(() =>
        supabase
          .from('notifications')
          .update({ is_read: true })
          .in('target_audience', audiences)
      );
    } catch (dbErr) {
      console.warn('[markAllAsRead] Broadcast DB update error:', dbErr.message);
    }

    // Update in-memory notifications
    inMemoryNotifications.forEach(n => {
      if (n.target_user_id === userId || audiences.includes(n.target_audience)) {
        n.is_read = true;
      }
    });

    try {
      broadcastSync('NOTIFICATION_READ_ALL', { userId });
    } catch (_) {}

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
  let validTargetUserId = isValidUuid(target_user_id) ? target_user_id : null;
  let validSenderId = isValidUuid(sender_id) ? sender_id : null;
  let audience = target_audience || (validTargetUserId ? 'specific' : 'all');

  const record = {
    title: (title || 'System Notification').trim(),
    message: (message || '').trim(),
    target_audience: audience,
    target_user_id: validTargetUserId,
    sender_id: validSenderId,
    is_read: false,
    created_at: new Date().toISOString()
  };

  try {
    const { data } = await safeQuery(() =>
      supabase.from('notifications').insert([record]).select().single()
    );
    if (data) {
      try {
        broadcastSync('NOTIFICATION_RECEIVED', {
          notification: data,
          target_user_id: validTargetUserId,
          target_audience: audience
        });
      } catch (_) {}
      return data;
    }
  } catch (err) {
    console.warn('[createSystemNotification] DB insert warning:', err.message);
  }

  const mem = {
    id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    ...record
  };
  inMemoryNotifications.unshift(mem);
  try {
    broadcastSync('NOTIFICATION_RECEIVED', {
      notification: mem,
      target_user_id: validTargetUserId,
      target_audience: audience
    });
  } catch (_) {}
  return mem;
};
