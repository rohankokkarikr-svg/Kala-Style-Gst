import React, { useEffect, useState } from 'react';
import { 
  HiSearch, 
  HiFilter, 
  HiUsers, 
  HiShoppingBag, 
  HiCurrencyRupee, 
  HiCheckCircle, 
  HiXCircle, 
  HiBell, 
  HiRefresh,
  HiX
} from 'react-icons/hi';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [notifyModal, setNotifyModal] = useState(null);
  const [notifMessage, setNotifMessage] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getCustomers({ search, status: statusFilter, role: roleFilter });
      setCustomers(data || []);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [statusFilter, roleFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchCustomers();
  };

  const handleStatusToggle = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    try {
      await adminAPI.updateCustomerStatus(id, { status: nextStatus });
      toast.success(`Customer status set to ${nextStatus}`);
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, status: nextStatus } : c));
    } catch {
      toast.error('Failed to update customer status');
    }
  };

  const handleRoleChange = async (id, newRole) => {
    try {
      await adminAPI.updateUserRole(id, { role: newRole });
      toast.success(`User role successfully changed to ${newRole}`);
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, role: newRole } : c));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user role');
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
        title: `Notification for ${notifyModal.name}`,
        message: notifMessage,
        target_audience: 'specific',
        target_user_id: notifyModal.id
      });
      toast.success('Notification sent to customer!');
      setNotifyModal(null);
      setNotifMessage('');
    } catch {
      toast.error('Failed to send notification');
    } finally {
      setSendingNotif(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white">Customer Management</h1>
          <p className="text-gray-400 text-sm mt-1">
            Monitor registered buyers, total spend, order frequency, and account security.
          </p>
        </div>
        <button
          onClick={fetchCustomers}
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
              placeholder="Search by name or email..."
              className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-gold-500/60"
            />
          </div>
          <button type="submit" className="btn-primary text-xs py-2 px-3">
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <HiFilter className="text-gray-500 w-4 h-4 shrink-0" />
          <span className="text-xs text-gray-400 shrink-0">Status:</span>
          {['all', 'active', 'suspended'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`text-xs px-2.5 py-1 rounded-lg capitalize transition-all border ${
                statusFilter === st 
                  ? 'bg-gold-500/20 border-gold-500/50 text-gold-400 font-semibold' 
                  : 'border-dark-600 text-gray-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}

          <span className="text-xs text-gray-400 shrink-0 ml-1">Role:</span>
          {['all', 'user', 'artisan', 'admin'].map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`text-xs px-2.5 py-1 rounded-lg capitalize transition-all border ${
                roleFilter === r 
                  ? 'bg-gold-500/20 border-gold-500/50 text-gold-400 font-semibold' 
                  : 'border-dark-600 text-gray-400 hover:text-white'
              }`}
            >
              {r === 'all' ? 'All Roles' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Customers Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 shimmer rounded-lg" />)}
          </div>
        ) : customers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-dark-800/80 text-gray-400 border-b border-dark-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Orders Placed</th>
                  <th className="py-3 px-4">Total Spent</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 ring-1 ring-blue-500/40">
                          {c.name ? c.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-semibold text-white truncate">{c.name || 'Anonymous Buyer'}</p>
                          <p className="text-gray-400 text-[11px] truncate">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={c.role || 'user'}
                        onChange={(e) => handleRoleChange(c.id, e.target.value)}
                        className={`bg-dark-800 border text-xs rounded-lg px-2 py-1 font-semibold focus:outline-none cursor-pointer ${
                          c.role === 'admin'
                            ? 'border-gold-500/60 text-gold-400 bg-gold-500/10'
                            : c.role === 'artisan'
                            ? 'border-purple-500/60 text-purple-400 bg-purple-500/10'
                            : 'border-dark-600 text-gray-300'
                        }`}
                      >
                        <option value="user">User (Customer)</option>
                        <option value="artisan">Artisan</option>
                        <option value="admin">Admin 👑</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5 font-medium text-gray-200">
                        <HiShoppingBag className="w-3.5 h-3.5 text-gray-500" />
                        {c.orderCount || 0} orders
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-gold-400">
                        ₹{(c.totalSpent || 0).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {c.status === 'suspended' ? (
                        <span className="badge bg-red-500/20 text-red-400 border border-red-500/30">Suspended</span>
                      ) : (
                        <span className="badge bg-green-500/20 text-green-400 border border-green-500/30">Active</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '-'}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => setNotifyModal(c)}
                        className="p-1.5 text-blue-400 hover:text-blue-300 rounded bg-blue-500/10 hover:bg-blue-500/20"
                        title="Send Direct Notification"
                      >
                        <HiBell className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStatusToggle(c.id, c.status)}
                        className={`p-1.5 rounded transition-colors ${
                          c.status === 'suspended' 
                            ? 'text-green-400 bg-green-500/10 hover:bg-green-500/20' 
                            : 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                        }`}
                        title={c.status === 'suspended' ? 'Activate Account' : 'Suspend Account'}
                      >
                        {c.status === 'suspended' ? <HiCheckCircle className="w-4 h-4" /> : <HiXCircle className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500 text-sm">
            No customers found matching your criteria.
          </div>
        )}
      </div>

      {/* Modal: Direct Notification */}
      {notifyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4 border border-dark-500">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">Notify {notifyModal.name}</h3>
              <button onClick={() => setNotifyModal(null)} className="text-gray-400 hover:text-white">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <textarea
              rows={4}
              value={notifMessage}
              onChange={e => setNotifMessage(e.target.value)}
              placeholder="Write customer notification message..."
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
