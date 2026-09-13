import React, { useState, useEffect, useRef } from 'react';
import { 
  HiBell, 
  HiCheck, 
  HiChatAlt2, 
  HiReply, 
  HiRefresh, 
  HiSparkles,
  HiCheckCircle,
  HiOutlineInbox,
  HiShieldCheck,
  HiUser,
  HiExternalLink
} from 'react-icons/hi';
import { notificationAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SendMessageModal from './SendMessageModal';
import toast from 'react-hot-toast';

export default function NotificationCenter({ className = '', buttonClassName = '' }) {
  const { isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [composeModalOpen, setComposeModalOpen] = useState(false);

  const dropdownRef = useRef(null);

  const getReadStorageKey = () => `kala_read_notifs_${user?.id || 'guest'}`;

  const fetchNotifications = async (silent = false) => {
    if (!isAuthenticated) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await notificationAPI.getMyNotifications();
      if (data && data.success) {
        // Read persisted IDs from localStorage to guarantee read state never flips back on re-fetch
        let localReadIds = new Set();
        try {
          const stored = JSON.parse(localStorage.getItem(getReadStorageKey()) || '[]');
          localReadIds = new Set(stored);
        } catch (e) {}

        const rawNotifs = data.notifications || [];
        const syncedNotifs = rawNotifs.map(n => ({
          ...n,
          is_read: Boolean(n.is_read || localReadIds.has(n.id))
        }));

        // Strict role filtering for customer/user side:
        // Show ONLY admin messages (broadcast or direct) AND artisan messages sent to this particular user
        const currentRole = (user?.role || 'user').toLowerCase();
        let roleFiltered = syncedNotifs;
        if (currentRole === 'user' || currentRole === 'customer') {
          roleFiltered = syncedNotifs.filter(n => {
            const senderRole = (n.sender?.role || '').toLowerCase();
            const isFromAdmin = senderRole === 'admin' || !n.sender_id;
            const isDirectFromArtisan = senderRole === 'artisan' && n.target_user_id === user?.id;
            const isDirectFromAdmin = senderRole === 'admin' && n.target_user_id === user?.id;
            const isBroadcastFromAdmin = isFromAdmin && (n.target_audience === 'all' || n.target_audience === 'customers');
            return isBroadcastFromAdmin || isDirectFromAdmin || isDirectFromArtisan;
          });
        }

        setNotifications(roleFiltered);
        setUnreadCount(roleFiltered.filter(n => !n.is_read).length);
      }
    } catch (err) {
      if (!silent) console.warn('Failed to load notifications:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Auto refresh every 15 seconds for real-time responsiveness
    const timer = setInterval(() => {
      fetchNotifications(true);
    }, 15000);

    // Listen for custom sync events
    const handleRefresh = () => fetchNotifications(true);
    window.addEventListener('kala:notification:refresh', handleRefresh);
    window.addEventListener('kala:sync:orders_updated', handleRefresh);

    return () => {
      clearInterval(timer);
      window.removeEventListener('kala:notification:refresh', handleRefresh);
      window.removeEventListener('kala:sync:orders_updated', handleRefresh);
    };
  }, [isAuthenticated, user?.id]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleMarkAsRead = async (id, e) => {
    e?.stopPropagation();
    try {
      // 1. Immediately persist to localStorage so polling NEVER reverts it
      try {
        const key = getReadStorageKey();
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        if (!stored.includes(id)) {
          stored.push(id);
          localStorage.setItem(key, JSON.stringify(stored));
        }
      } catch (e) {}

      // 2. Update UI state immediately
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));

      // 3. Persist to backend database
      await notificationAPI.markAsRead(id);
    } catch (err) {
      console.warn('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      // 1. Immediately persist all IDs in localStorage
      try {
        const key = getReadStorageKey();
        const currentIds = notifications.map(n => n.id);
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        const merged = Array.from(new Set([...stored, ...currentIds]));
        localStorage.setItem(key, JSON.stringify(merged));
      } catch (e) {}

      // 2. Update UI state immediately
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');

      // 3. Persist to backend database
      await notificationAPI.markAllAsRead();
    } catch (err) {
      toast.error('Failed to mark all as read');
    }
  };

  const handleOpenReply = (notif, e) => {
    e?.stopPropagation();
    if (notif.sender_id) {
      setReplyTarget({
        recipientId: notif.sender_id,
        recipientName: notif.sender?.name || 'Sender',
        recipientRole: notif.sender?.role || 'artisan',
        defaultTitle: `Re: ${notif.title || 'Message'}`
      });
      setReplyModalOpen(true);
      setIsOpen(false);
    } else {
      // If no sender_id (system notification), compose to admin
      setComposeModalOpen(true);
      setIsOpen(false);
    }
  };

  if (!isAuthenticated) return null;

  const filteredNotifications = activeTab === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications(true);
        }}
        className={buttonClassName || "relative p-2 rounded-xl text-gray-300 hover:text-gold-400 hover:bg-dark-800/80 transition-all cursor-pointer focus:outline-none"}
        title="Notifications & Messages"
        aria-label="Notifications"
      >
        <HiBell className="w-5 h-5 transition-transform group-hover:scale-110" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold shadow-md shadow-red-500/30 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel - 100% Solid Non-Transparent Luxury Background */}
      {isOpen && (
        <div 
          style={{ backgroundColor: '#121212' }}
          className="absolute right-0 mt-3 w-80 sm:w-96 bg-[#121212] border border-dark-600 rounded-2xl shadow-2xl shadow-black z-[999] overflow-hidden"
        >
          {/* Header */}
          <div 
            style={{ backgroundColor: '#181818' }}
            className="p-4 border-b border-dark-700 bg-[#181818] flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <HiBell className="text-gold-400 w-5 h-5" />
              <h3 className="font-serif font-bold text-white text-sm">Notifications & Messages</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-500/20 text-gold-400 font-bold border border-gold-500/30">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fetchNotifications(false)}
                disabled={loading}
                className="p-1 text-gray-400 hover:text-white rounded hover:bg-dark-700 transition-colors"
                title="Refresh"
              >
                <HiRefresh className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-gold-400 hover:text-gold-300 font-semibold px-2 py-1 rounded bg-dark-700 hover:bg-dark-600 transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Sub-tabs & Compose button */}
          <div 
            style={{ backgroundColor: '#0d0d0d' }}
            className="px-4 py-2 border-b border-dark-700 bg-[#0d0d0d] flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  activeTab === 'all' ? 'bg-gold-500 text-dark-950 font-bold' : 'text-gray-400 hover:text-gray-200 bg-dark-800'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('unread')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  activeTab === 'unread' ? 'bg-gold-500 text-dark-950 font-bold' : 'text-gray-400 hover:text-gray-200 bg-dark-800'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setComposeModalOpen(true);
                setIsOpen(false);
              }}
              className="flex items-center gap-1 text-[11px] text-gold-400 hover:text-gold-300 font-bold px-2.5 py-1 rounded-lg bg-gold-500/15 hover:bg-gold-500/25 border border-gold-500/30 transition-all cursor-pointer"
            >
              <HiChatAlt2 className="w-3.5 h-3.5" />
              <span>New Message</span>
            </button>
          </div>

          {/* List of Notifications */}
          <div 
            style={{ backgroundColor: '#121212' }}
            className="max-h-[380px] overflow-y-auto divide-y divide-dark-700 bg-[#121212]"
          >
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-gray-500">Checking for new messages...</p>
              </div>
            ) : filteredNotifications.length > 0 ? (
              filteredNotifications.map((notif) => {
                const isUnread = !notif.is_read;
                const senderRole = notif.sender?.role || 'system';
                const senderName = notif.sender?.name || (senderRole === 'admin' ? 'Support Admin' : 'Platform');

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (isUnread) handleMarkAsRead(notif.id);
                    }}
                    style={{ backgroundColor: isUnread ? '#1a1811' : '#141414' }}
                    className={`p-4 transition-colors cursor-pointer text-xs space-y-1.5 border-b border-dark-700/60 ${
                      isUnread 
                        ? 'bg-[#1a1811] hover:bg-[#221f15] border-l-2 border-l-gold-500' 
                        : 'bg-[#141414] hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {senderRole === 'admin' ? (
                          <span className="w-6 h-6 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center shrink-0 text-xs">
                            🛡️
                          </span>
                        ) : senderRole === 'artisan' ? (
                          <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 text-xs">
                            👨‍🎨
                          </span>
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-xs">
                            👤
                          </span>
                        )}
                        <div>
                          <p className="font-bold text-white text-xs leading-tight">
                            {notif.title || 'New Message'}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            From: <strong className="text-gold-400">{senderName}</strong>
                            {senderRole !== 'system' && ` (${senderRole})`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-gold-400 shrink-0" title="Unread" />
                        )}
                        <span className="text-[10px] text-gray-500">
                          {notif.created_at ? new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                        </span>
                      </div>
                    </div>

                    <p className="text-gray-300 text-xs leading-relaxed pl-8 break-words whitespace-pre-line">
                      {notif.message}
                    </p>

                    <div className="flex items-center justify-between pt-1 pl-8 text-[10px]">
                      <span className="text-gray-500">
                        {notif.created_at ? new Date(notif.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        {notif.sender_id && notif.sender_id !== user?.id && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenReply(notif, e)}
                            className="text-gold-400 hover:text-gold-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <HiReply className="w-3 h-3" /> Reply
                          </button>
                        )}
                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                            className="text-gray-400 hover:text-white flex items-center gap-0.5 hover:underline"
                          >
                            <HiCheck className="w-3 h-3" /> Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center space-y-2">
                <HiOutlineInbox className="w-8 h-8 text-gray-600 mx-auto" />
                <p className="text-xs text-gray-400 font-medium">No {activeTab === 'unread' ? 'unread ' : ''}notifications yet</p>
                <p className="text-[11px] text-gray-600">You will receive real-time messages and order alerts here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {replyModalOpen && replyTarget && (
        <SendMessageModal
          isOpen={replyModalOpen}
          onClose={() => {
            setReplyModalOpen(false);
            setReplyTarget(null);
          }}
          initialRecipientId={replyTarget.recipientId}
          initialRecipientName={replyTarget.recipientName}
          initialRecipientRole={replyTarget.recipientRole}
          defaultTitle={replyTarget.defaultTitle}
        />
      )}

      {/* Compose Message Modal */}
      {composeModalOpen && (
        <SendMessageModal
          isOpen={composeModalOpen}
          onClose={() => setComposeModalOpen(false)}
        />
      )}
    </div>
  );
}
