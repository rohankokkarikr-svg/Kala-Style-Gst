import React, { useEffect, useState } from 'react';
import { 
  HiBell, 
  HiPaperAirplane, 
  HiRefresh, 
  HiEye, 
  HiX,
  HiChatAlt2,
  HiReply,
  HiInbox,
  HiCheck
} from 'react-icons/hi';
import { adminAPI, notificationAPI } from '../../services/api';
import SendMessageModal from '../../components/SendMessageModal';
import toast from 'react-hot-toast';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('incoming'); // 'incoming' | 'broadcast'
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState('all');
  const [specificUserId, setSpecificUserId] = useState('');
  const [recipients, setRecipients] = useState({ artisans: [], customers: [] });
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);

  const getAdminStorageKey = () => 'kala_read_notifs_admin';

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getNotifications();
      let localReadIds = new Set();
      try {
        const stored = JSON.parse(localStorage.getItem(getAdminStorageKey()) || '[]');
        localReadIds = new Set(stored);
      } catch (e) {}

      const synced = (data || []).map(n => ({
        ...n,
        is_read: Boolean(n.is_read || localReadIds.has(n.id))
      }));

      setNotifications(synced);
    } catch {
      toast.error('Failed to load notifications history');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipients = async () => {
    try {
      const { data } = await notificationAPI.getRecipients();
      if (data) {
        setRecipients({
          artisans: data.artisans || [],
          customers: data.customers || []
        });
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchNotifications();
    fetchRecipients();

    const handleRefresh = () => fetchNotifications();
    window.addEventListener('kala:notification:refresh', handleRefresh);
    return () => window.removeEventListener('kala:notification:refresh', handleRefresh);
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error('Please fill in both title and message');
      return;
    }
    setSending(true);
    try {
      await adminAPI.sendNotification({
        title: title.trim(),
        message: message.trim(),
        target_audience: specificUserId ? 'specific' : targetAudience,
        target_user_id: specificUserId || undefined,
      });
      toast.success('Notification dispatched successfully! 🚀');
      setTitle('');
      setMessage('');
      setSpecificUserId('');
      setPreviewOpen(false);
      window.dispatchEvent(new CustomEvent('kala:notification:refresh'));
      fetchNotifications();
    } catch {
      toast.error('Failed to broadcast notification');
    } finally {
      setSending(false);
    }
  };

  const handleOpenReply = (notif) => {
    if (notif.sender_id) {
      setReplyTarget({
        recipientId: notif.sender_id,
        recipientName: notif.sender?.name || 'User',
        recipientRole: notif.sender?.role || 'artisan',
        defaultTitle: `Re: ${notif.title || 'Inquiry'}`
      });
      setReplyModalOpen(true);
    }
  };

  const handleMarkAsRead = async (id, e) => {
    e?.stopPropagation();
    try {
      try {
        const key = getAdminStorageKey();
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        if (!stored.includes(id)) {
          stored.push(id);
          localStorage.setItem(key, JSON.stringify(stored));
        }
      } catch (err) {}

      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      await notificationAPI.markAsRead(id);
    } catch (err) {
      console.warn('Failed to mark read:', err);
    }
  };

  // Incoming messages sent by users/artisans to Admin
  const incomingMessages = notifications.filter(n => 
    n.sender && n.sender.role !== 'admin' && (n.target_audience === 'admins' || n.target_audience === 'specific')
  );

  // Broadcasts sent by admin
  const sentBroadcasts = notifications.filter(n =>
    !n.sender || n.sender.role === 'admin'
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-dark-800 via-dark-800 to-gold-500/10 border border-dark-600 p-6 rounded-2xl">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
            <HiBell className="text-gold-400 w-7 h-7" />
            <span>Platform Broadcast & In-App Messaging</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Real-time messaging between Customers, Artisans, and Platform Administration.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchNotifications}
            className="btn-secondary flex items-center gap-2 text-xs py-2 px-3 shrink-0"
          >
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-dark-600 pb-3">
        <button
          type="button"
          onClick={() => setActiveView('incoming')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeView === 'incoming'
              ? 'bg-gold-500 text-dark-950 shadow-gold'
              : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-600'
          }`}
        >
          <HiInbox className="w-4 h-4" />
          <span>Incoming Inquiries & Messages</span>
          {incomingMessages.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeView === 'incoming' ? 'bg-dark-900 text-gold-400' : 'bg-gold-500/20 text-gold-400'
            }`}>
              {incomingMessages.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveView('broadcast')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeView === 'broadcast'
              ? 'bg-gold-500 text-dark-950 shadow-gold'
              : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-600'
          }`}
        >
          <HiPaperAirplane className="w-4 h-4 rotate-90" />
          <span>Broadcast & Direct Dispatch</span>
        </button>
      </div>

      {activeView === 'incoming' ? (
        /* Incoming Messages View */
        <div className="card p-6 space-y-4 border border-dark-600">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              <HiChatAlt2 className="text-gold-400 w-5 h-5" />
              Incoming Messages from Artisans & Customers
            </h2>
            <span className="text-xs text-gray-500">Live Real-Time Feed</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 shimmer rounded-xl" />)}
            </div>
          ) : incomingMessages.length > 0 ? (
            <div className="space-y-3">
              {incomingMessages.map((msg) => {
                const senderRole = msg.sender?.role || 'user';
                const isUnread = !msg.is_read;
                return (
                  <div
                    key={msg.id}
                    className={`p-4 rounded-xl border transition-all space-y-3 ${
                      isUnread 
                        ? 'bg-dark-750 border-gold-500/50 shadow-sm shadow-gold/5 border-l-4 border-l-gold-500' 
                        : 'bg-dark-800/90 border-dark-600 hover:border-dark-500'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dark-650 pb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-full bg-gold-500/15 text-gold-400 flex items-center justify-center font-bold text-xs shrink-0 border border-gold-500/30">
                          {senderRole === 'artisan' ? '👨‍🎨' : '👤'}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white text-sm">
                              {msg.sender?.name || 'Registered User'}
                            </p>
                            {isUnread && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-gold-500/20 text-gold-400 border border-gold-500/30">
                                New
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Role: <span className="text-gold-400 capitalize font-medium">{senderRole}</span>
                            {msg.sender?.email && ` • ${msg.sender.email}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-start sm:self-auto">
                        <span className="text-[10px] text-gray-500">
                          {msg.created_at ? new Date(msg.created_at).toLocaleString('en-IN') : 'Recently'}
                        </span>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(msg.id, e)}
                            className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 cursor-pointer hover:text-white"
                            title="Mark this inquiry as read"
                          >
                            <HiCheck className="w-3.5 h-3.5 text-gold-400" /> Mark read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenReply(msg)}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-gold cursor-pointer"
                        >
                          <HiReply className="w-3.5 h-3.5" /> Reply Directly
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gold-300 text-xs mb-1">
                        {msg.title || 'Inquiry'}
                      </h4>
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line bg-dark-800/80 p-3 rounded-lg border border-dark-650">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 text-xs space-y-2">
              <HiInbox className="w-10 h-10 text-gray-600 mx-auto" />
              <p className="text-white font-medium">No incoming user inquiries yet.</p>
              <p>When customers or artisans send a message to Admin, it will appear here in real time.</p>
            </div>
          )}
        </div>
      ) : (
        /* Broadcast & Direct Dispatch View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-1">
            <form onSubmit={handleSend} className="card p-6 space-y-4 border border-dark-600">
              <h2 className="font-bold text-white text-base flex items-center gap-2">
                <HiPaperAirplane className="text-gold-400 w-4 h-4 rotate-90" />
                Dispatch Notification
              </h2>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Recipient Mode</label>
                  <select
                    value={targetAudience}
                    onChange={e => {
                      setTargetAudience(e.target.value);
                      if (e.target.value !== 'specific') setSpecificUserId('');
                    }}
                    style={{ backgroundColor: '#202020', color: '#ffffff' }}
                    className="w-full bg-[#202020] border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                  >
                    <option value="all" style={{ backgroundColor: '#202020' }}>🌍 All Users (Artisans + Customers)</option>
                    <option value="artisans" style={{ backgroundColor: '#202020' }}>👨‍🎨 All Artisans</option>
                    <option value="customers" style={{ backgroundColor: '#202020' }}>👥 All Customers</option>
                    <option value="specific" style={{ backgroundColor: '#202020' }}>🎯 Specific Artisan or Customer</option>
                  </select>
                </div>

                {targetAudience === 'specific' && (
                  <div>
                    <label className="block text-gray-400 font-semibold mb-1">Select Specific Recipient *</label>
                    <select
                      value={specificUserId}
                      onChange={e => setSpecificUserId(e.target.value)}
                      style={{ backgroundColor: '#202020', color: '#ffffff' }}
                      className="w-full bg-[#202020] border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                      required
                    >
                      <option value="" style={{ backgroundColor: '#202020' }}>-- Choose Artisan or Customer --</option>
                      {recipients.artisans.length > 0 && (
                        <optgroup label="Artisan Workshops" style={{ backgroundColor: '#202020' }}>
                          {recipients.artisans.map(a => (
                            <option key={a.id} value={a.user_id || a.id} style={{ backgroundColor: '#202020' }}>
                              🎨 {a.store_name} ({a.specialization || 'Artisan'})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {recipients.customers.length > 0 && (
                        <optgroup label="Customers" style={{ backgroundColor: '#202020' }}>
                          {recipients.customers.map(c => (
                            <option key={c.id} value={c.id} style={{ backgroundColor: '#202020' }}>
                              👤 {c.name || 'Customer'} ({c.email})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Notification Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Diwali Artisan Fair or Account Verification"
                    style={{ backgroundColor: '#202020', color: '#ffffff' }}
                    className="w-full bg-[#202020] border border-dark-500 rounded-lg p-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-gold-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Message Content *</label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Type your message here..."
                    style={{ backgroundColor: '#202020', color: '#ffffff' }}
                    className="w-full bg-[#202020] border border-dark-500 rounded-lg p-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-gold-500 resize-none leading-relaxed"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-dark-600">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!title || !message}
                  className="btn-secondary text-xs py-2 px-3 flex-1 flex items-center justify-center gap-1"
                >
                  <HiEye className="w-4 h-4" /> Preview
                </button>
                <button
                  type="submit"
                  disabled={sending || !title.trim() || !message.trim()}
                  className="btn-primary text-xs py-2 px-4 flex-1 flex items-center justify-center gap-1"
                >
                  <HiPaperAirplane className="w-4 h-4 rotate-90" />
                  {sending ? 'Sending...' : 'Send Now'}
                </button>
              </div>
            </form>
          </div>

          {/* Sent History */}
          <div className="lg:col-span-2 card p-6 space-y-4">
            <h2 className="font-bold text-white text-base">Broadcast & Sent Logs</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 shimmer rounded-lg" />)}
              </div>
            ) : sentBroadcasts.length > 0 ? (
              <div className="space-y-3 max-h-[550px] overflow-y-auto">
                {sentBroadcasts.map((n, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-dark-750 border border-dark-600/70 space-y-2 hover:border-gold-500/30 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-white text-sm truncate">{n.title}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-dark-700 text-gold-400 border border-dark-600 capitalize font-medium shrink-0">
                        {n.target_audience === 'all' ? 'All Users' : n.target_audience}
                      </span>
                    </div>
                    <p className="text-gray-300 text-xs leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-gray-500 pt-1">
                      Sent on {n.created_at ? new Date(n.created_at).toLocaleString('en-IN') : 'Recently'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 text-xs">
                No notifications broadcasted yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4 border border-gold-500/50 shadow-gold/20 shadow-lg">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gold-400 text-sm">Notification Preview (As Seen by Users)</h3>
              <button onClick={() => setPreviewOpen(false)} className="text-gray-400 hover:text-white">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-dark-750 border border-dark-600 space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-full bg-gold-500/20 text-gold-400">
                  <HiBell className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-white text-sm">{title || 'Notification Title'}</h4>
              </div>
              <p className="text-gray-300 text-xs leading-relaxed">{message || 'Your notification message...'}</p>
            </div>
            <button onClick={() => setPreviewOpen(false)} className="btn-secondary w-full text-xs py-2">
              Close Preview
            </button>
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
    </div>
  );
}
