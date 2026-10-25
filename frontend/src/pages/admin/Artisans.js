import React, { useEffect, useState } from 'react';
import { 
  HiSearch, 
  HiFilter, 
  HiCheckCircle, 
  HiXCircle, 
  HiExclamation, 
  HiEye, 
  HiBell, 
  HiX,
  HiRefresh
} from 'react-icons/hi';
import { adminAPI } from '../../services/api';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import toast from 'react-hot-toast';

export default function Artisans() {
  const { triggerLiveSync } = useRealtimeSync();
  const [artisans, setArtisans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedArtisan, setSelectedArtisan] = useState(null);
  const [notifyModal, setNotifyModal] = useState(null);
  const [notifMessage, setNotifMessage] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  const fetchArtisans = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getArtisans({ search, status: statusFilter });
      setArtisans(data || []);
    } catch (err) {
      toast.error('Failed to load artisans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtisans();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchArtisans();
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      const targetArtisan = artisans.find(a => a.id === id);
      const res = await adminAPI.updateArtisanStatus(id, { verification_status: status });
      toast.success(`Artisan status updated to ${status}`);
      setArtisans(prev => prev.map(a => a.id === id ? { ...a, verification_status: status } : a));
      if (selectedArtisan && selectedArtisan.id === id) {
        setSelectedArtisan(prev => ({ ...prev, verification_status: status }));
      }
      triggerLiveSync('ARTISANS_UPDATED', {
        id,
        user_id: targetArtisan?.user_id,
        verification_status: status,
        artisan: res.data?.artisan
      });
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleSendNotification = async () => {
    if (!notifMessage.trim()) {
      toast.error('Please enter a message');
      return;
    }
    setSendingNotif(true);
    try {
      await adminAPI.sendNotification({
        title: `Message from Admin to ${notifyModal.store_name}`,
        message: notifMessage,
        target_audience: 'specific',
        target_user_id: notifyModal.user_id || notifyModal.id
      });
      toast.success('Notification sent to artisan!');
      setNotifyModal(null);
      setNotifMessage('');
    } catch {
      toast.error('Failed to send notification');
    } finally {
      setSendingNotif(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'verified':
        return <span className="badge bg-green-500/20 text-green-400 border border-green-500/30">✓ Verified</span>;
      case 'rejected':
      case 'suspended':
        return <span className="badge bg-red-500/20 text-red-400 border border-red-500/30">✗ Suspended</span>;
      default:
        return <span className="badge bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">⏳ Pending</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white">Artisan Management</h1>
          <p className="text-gray-400 text-sm mt-1">
            Review, verify, and support registered Indian craftspeople and master artisans.
          </p>
        </div>
        <button
          onClick={fetchArtisans}
          className="btn-secondary self-start sm:self-auto flex items-center gap-2 text-xs py-2"
        >
          <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh List
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
          <div className="relative flex-1">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, craft, location..."
              className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-gold-500/60"
            />
          </div>
          <button type="submit" className="btn-primary text-xs py-2 px-3">
            Search
          </button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <HiFilter className="text-gray-500 w-4 h-4 shrink-0" />
          <span className="text-xs text-gray-400 shrink-0">Filter:</span>
          {['all', 'verified', 'pending', 'suspended'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize whitespace-nowrap transition-all border ${
                statusFilter === st 
                  ? 'bg-gold-500/20 border-gold-500/50 text-gold-400 font-semibold' 
                  : 'border-dark-600 text-gray-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Artisans Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 shimmer rounded-lg" />)}
          </div>
        ) : artisans.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-dark-800/80 text-gray-400 border-b border-dark-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Artisan & Store</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Craft Specialization</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {artisans.map(a => (
                  <tr key={a.id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={a.profile_image || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop'}
                          alt={a.store_name}
                          className="w-9 h-9 rounded-full object-cover ring-1 ring-gold-500/40 shrink-0"
                        />
                        <div className="overflow-hidden">
                          <p className="font-semibold text-white truncate">{a.store_name}</p>
                          <p className="text-gray-400 text-[11px] truncate">{a.users?.name || 'Artisan'}</p>
                          <p className="text-gray-500 text-[10px] truncate">{a.users?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      {a.location || 'India'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-dark-700 text-gold-400 border border-dark-600 font-medium">
                        {a.specialization || a.artisan_type || 'Handicrafts'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(a.verification_status)}
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN') : '-'}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={() => setSelectedArtisan(a)}
                        className="p-1.5 text-gray-400 hover:text-white rounded bg-dark-700 hover:bg-dark-600"
                        title="View Profile Details"
                      >
                        <HiEye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setNotifyModal(a)}
                        className="p-1.5 text-blue-400 hover:text-blue-300 rounded bg-blue-500/10 hover:bg-blue-500/20"
                        title="Send Notification"
                      >
                        <HiBell className="w-4 h-4" />
                      </button>
                      {a.verification_status !== 'verified' && (
                        <button
                          onClick={() => handleUpdateStatus(a.id, 'verified')}
                          className="p-1.5 text-green-400 hover:text-green-300 rounded bg-green-500/10 hover:bg-green-500/20"
                          title="Verify Artisan"
                        >
                          <HiCheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {a.verification_status !== 'suspended' && (
                        <button
                          onClick={() => handleUpdateStatus(a.id, 'suspended')}
                          className="p-1.5 text-red-400 hover:text-red-300 rounded bg-red-500/10 hover:bg-red-500/20"
                          title="Suspend Account"
                        >
                          <HiXCircle className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500 text-sm">
            No artisans found matching your criteria.
          </div>
        )}
      </div>

      {/* Modal: View Details */}
      {selectedArtisan && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-6 space-y-4 border border-dark-500 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedArtisan(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <HiX className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-4">
              <img
                src={selectedArtisan.profile_image || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop'}
                alt=""
                className="w-14 h-14 rounded-full object-cover ring-2 ring-gold-500"
              />
              <div>
                <h3 className="text-lg font-bold text-white">{selectedArtisan.store_name}</h3>
                <p className="text-gray-400 text-xs">{selectedArtisan.users?.name} • {selectedArtisan.users?.email}</p>
                <div className="mt-1">{getStatusBadge(selectedArtisan.verification_status)}</div>
              </div>
            </div>
            <div className="space-y-2 text-xs border-t border-dark-600 pt-3">
              <p><strong className="text-gray-400">Location:</strong> <span className="text-white">{selectedArtisan.location || 'India'}</span></p>
              <p><strong className="text-gray-400">Craft:</strong> <span className="text-gold-400">{selectedArtisan.specialization || 'Handicrafts'}</span></p>
              <p><strong className="text-gray-400">Preferred Language:</strong> <span className="text-white">{selectedArtisan.preferred_language || 'English'}</span></p>
              <p><strong className="text-gray-400">Artisan Bio / Story:</strong></p>
              <div className="p-3 bg-dark-750 rounded-lg text-gray-300 leading-relaxed max-h-36 overflow-y-auto border border-dark-600">
                {selectedArtisan.bio || 'No bio provided yet.'}
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-dark-600">
              {selectedArtisan.verification_status !== 'verified' ? (
                <button
                  onClick={() => handleUpdateStatus(selectedArtisan.id, 'verified')}
                  className="btn-primary flex-1 text-xs py-2"
                >
                  ✓ Approve & Verify
                </button>
              ) : (
                <button
                  onClick={() => handleUpdateStatus(selectedArtisan.id, 'suspended')}
                  className="btn-secondary text-red-400 hover:bg-red-400/10 flex-1 text-xs py-2"
                >
                  Suspend Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Send Notification */}
      {notifyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4 border border-dark-500">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">Send Notification to {notifyModal.store_name}</h3>
              <button onClick={() => setNotifyModal(null)} className="text-gray-400 hover:text-white">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <textarea
              rows={4}
              value={notifMessage}
              onChange={e => setNotifMessage(e.target.value)}
              placeholder="Write your message here (e.g., account updates, quality guidelines)..."
              className="w-full bg-dark-700 border border-dark-500 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-gold-500 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setNotifyModal(null)} className="btn-secondary text-xs py-2 px-3">
                Cancel
              </button>
              <button
                onClick={handleSendNotification}
                disabled={sendingNotif}
                className="btn-primary text-xs py-2 px-4"
              >
                {sendingNotif ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
