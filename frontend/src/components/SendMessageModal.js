import React, { useState, useEffect } from 'react';
import { 
  HiX, 
  HiPaperAirplane, 
  HiChatAlt2, 
  HiUser, 
  HiShieldCheck,
  HiSparkles
} from 'react-icons/hi';
import { notificationAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function SendMessageModal({ 
  isOpen, 
  onClose, 
  initialRecipientId = null,
  initialRecipientName = '',
  initialRecipientRole = '',
  defaultTitle = '',
  productContext = null,
  orderContext = null
}) {
  const { user } = useAuth();
  const [recipients, setRecipients] = useState({ admins: [], artisans: [], customers: [] });
  const [recipientType, setRecipientType] = useState(initialRecipientId ? 'specific' : 'admin');
  const [selectedRecipientId, setSelectedRecipientId] = useState(initialRecipientId || '');
  const [title, setTitle] = useState(defaultTitle || '');
  const [message, setMessage] = useState('');
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialRecipientId) {
        setSelectedRecipientId(initialRecipientId);
        setRecipientType('specific');
      } else {
        setRecipientType('admin');
      }
      if (defaultTitle) {
        setTitle(defaultTitle);
      } else if (productContext) {
        setTitle(`Inquiry regarding: ${productContext.name}`);
      } else if (orderContext) {
        setTitle(`Inquiry about Order #${orderContext.order_number || orderContext.id?.slice(0, 8)}`);
      }
      loadRecipients();
    }
  }, [isOpen, initialRecipientId, defaultTitle, productContext, orderContext]);

  const loadRecipients = async () => {
    setLoadingRecipients(true);
    try {
      const { data } = await notificationAPI.getRecipients();
      if (data) {
        setRecipients({
          admins: data.admins || [],
          artisans: data.artisans || [],
          customers: data.customers || []
        });
      }
    } catch (err) {
      console.warn('Failed to load recipients list:', err);
    } finally {
      setLoadingRecipients(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error('Please write a message content');
      return;
    }

    setSending(true);
    try {
      let recipientIdToSend = selectedRecipientId;
      let recipientRoleToSend = initialRecipientRole;

      if (recipientType === 'admin') {
        recipientIdToSend = 'admin';
        recipientRoleToSend = 'admin';
      }

      const res = await notificationAPI.sendMessage({
        recipient_id: recipientIdToSend,
        recipient_role: recipientRoleToSend,
        title: title.trim() || undefined,
        message: message.trim()
      });

      if (res.data?.success) {
        toast.success('Message sent! Recipient will receive a live notification. 🚀');
        // Trigger live local event so notification centers update instantly
        window.dispatchEvent(new CustomEvent('kala:notification:refresh'));
        setMessage('');
        setTitle('');
        onClose();
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to send message. Please try again.';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div 
        style={{ backgroundColor: '#141414' }}
        className="bg-[#141414] border border-gold-500/40 rounded-2xl max-w-lg w-full shadow-2xl shadow-black overflow-hidden relative"
      >
        {/* Header */}
        <div 
          style={{ backgroundColor: '#1c1c1c' }}
          className="flex items-center justify-between px-6 py-4 border-b border-dark-600 bg-[#1c1c1c]"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400">
              <HiChatAlt2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Send Direct Message</h3>
              <p className="text-[11px] text-gray-400">Delivered directly into the recipient's notification center</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-dark-700 transition-colors"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Recipient Selection */}
          {!initialRecipientId && (
            <div className="space-y-1.5">
              <label className="block text-gray-300 font-semibold">Send Message To</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setRecipientType('admin'); setSelectedRecipientId(''); }}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-medium transition-all ${
                    recipientType === 'admin'
                      ? 'border-gold-500 bg-gold-500/15 text-gold-400 font-bold'
                      : 'border-dark-600 bg-dark-800 text-gray-400 hover:border-dark-500'
                  }`}
                >
                  <HiShieldCheck className="w-4 h-4" /> Platform Support (Admin)
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('specific')}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-medium transition-all ${
                    recipientType === 'specific'
                      ? 'border-gold-500 bg-gold-500/15 text-gold-400 font-bold'
                      : 'border-dark-600 bg-dark-800 text-gray-400 hover:border-dark-500'
                  }`}
                >
                  <HiUser className="w-4 h-4" /> Select Artisan / User
                </button>
              </div>

              {recipientType === 'specific' && (
                <div className="pt-2">
                  <select
                    value={selectedRecipientId}
                    onChange={(e) => setSelectedRecipientId(e.target.value)}
                    style={{ backgroundColor: '#202020', color: '#ffffff' }}
                    className="w-full bg-[#202020] border border-dark-600 rounded-xl p-2.5 text-white focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
                    required
                  >
                    <option value="" style={{ backgroundColor: '#202020' }}>-- Choose Artisan Workshop --</option>
                    {recipients.artisans.map(a => (
                      <option key={a.id} value={a.user_id || a.id} style={{ backgroundColor: '#202020' }}>
                        🎨 {a.store_name} ({a.specialization || 'Handmade Craft'})
                      </option>
                    ))}
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
            </div>
          )}

          {initialRecipientId && (
            <div 
              style={{ backgroundColor: '#1c1c1c' }}
              className="p-3 bg-[#1c1c1c] border border-dark-600 rounded-xl flex items-center justify-between"
            >
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Recipient</span>
                <span className="text-sm font-bold text-gold-400">
                  {initialRecipientName || 'Artisan Workshop'}
                </span>
              </div>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-gold-500/15 text-gold-400 border border-gold-500/30 font-semibold capitalize">
                {initialRecipientRole || 'Artisan'}
              </span>
            </div>
          )}

          {/* Subject / Title */}
          <div className="space-y-1.5">
            <label className="block text-gray-300 font-semibold">Subject / Title (Optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Custom craft inquiry or size inquiry"
              style={{ backgroundColor: '#202020', color: '#ffffff' }}
              className="w-full bg-[#202020] border border-dark-600 rounded-xl p-3 text-white text-xs placeholder-gray-400 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-colors"
            />
          </div>

          {/* Message Content */}
          <div className="space-y-1.5">
            <label className="block text-gray-300 font-semibold">
              Your Message <span className="text-gold-400">*</span>
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message details here..."
              style={{ backgroundColor: '#202020', color: '#ffffff' }}
              className="w-full bg-[#202020] border border-dark-600 rounded-xl p-3 text-white text-xs placeholder-gray-400 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 resize-none leading-relaxed transition-colors"
              required
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-dark-600">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-dark-600 bg-dark-800 hover:bg-dark-700 text-gray-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="px-5 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-dark-950 font-bold text-xs flex items-center gap-1.5 shadow-gold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiPaperAirplane className="w-3.5 h-3.5 rotate-90" />
              <span>{sending ? 'Sending...' : 'Send Message'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
