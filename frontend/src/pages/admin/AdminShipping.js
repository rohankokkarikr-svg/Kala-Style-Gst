import React, { useEffect, useState } from 'react';
import {
  HiTruck,
  HiCheckCircle,
  HiClock,
  HiExclamation,
  HiSearch,
  HiRefresh,
  HiDocumentDownload,
  HiClipboardCopy,
  HiExternalLink,
  HiX,
  HiLocationMarker,
  HiCalendar,
  HiCube,
  HiPlusCircle,
} from 'react-icons/hi';
import { shippingAPI, orderAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminShipping() {
  const [shipments, setShipments] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Modals & Drawers
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [activeTracking, setActiveTracking] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const [calcDrawerOpen, setCalcDrawerOpen] = useState(false);
  const [calcPickupPin, setCalcPickupPin] = useState('560001');
  const [calcDeliveryPin, setCalcDeliveryPin] = useState('');
  const [calcWeight, setCalcWeight] = useState('0.5');
  const [calcCod, setCalcCod] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Action loading states
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [shipmentsRes, statsRes] = await Promise.allSettled([
        shippingAPI.getShipments({ status: statusFilter, search }),
        shippingAPI.getStatistics(),
      ]);

      if (shipmentsRes.status === 'fulfilled') {
        setShipments(shipmentsRes.value.data || []);
      }
      if (statsRes.status === 'fulfilled') {
        setStatistics(statsRes.value.data || null);
      }
    } catch (err) {
      console.error('Failed to fetch shipping data:', err);
      toast.error('Failed to load logistics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchData();
  };

  // Open Live Tracking Modal
  const handleOpenTracking = async (shipment) => {
    setTrackingModalOpen(true);
    setTrackingLoading(true);
    try {
      const res = await shippingAPI.trackShipment(shipment.id);
      setActiveTracking(res.data);
    } catch (err) {
      toast.error('Unable to fetch live tracking scans');
      setActiveTracking({
        awb_code: shipment.awb_code,
        courier_name: shipment.courier_name,
        normalized_status: shipment.status,
        current_location: 'In Transit',
        scans: [],
      });
    } finally {
      setTrackingLoading(false);
    }
  };

  // Assign AWB
  const handleAssignAwb = async (shipmentId) => {
    setActionLoadingId(shipmentId);
    try {
      const res = await shippingAPI.assignAWB(shipmentId);
      toast.success(res.data?.message || 'AWB assigned successfully!');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'AWB assignment failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Schedule Pickup
  const handleSchedulePickup = async (shipmentId) => {
    setActionLoadingId(shipmentId);
    try {
      const res = await shippingAPI.schedulePickup(shipmentId);
      toast.success(res.data?.message || 'Pickup scheduled with courier!');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to schedule pickup');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Generate Label
  const handleGenerateLabel = async (shipmentId) => {
    setActionLoadingId(shipmentId);
    try {
      const res = await shippingAPI.generateLabel(shipmentId);
      if (res.data?.label_url) {
        window.open(res.data.label_url, '_blank');
        toast.success('Shipping label generated!');
      } else {
        toast.error('No label URL returned by provider');
      }
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Label generation failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Generate Invoice
  const handleGenerateInvoice = async (shipmentId) => {
    setActionLoadingId(shipmentId);
    try {
      const res = await shippingAPI.generateInvoice(shipmentId);
      if (res.data?.invoice_url) {
        window.open(res.data.invoice_url, '_blank');
        toast.success('Shipping invoice generated!');
      } else {
        toast.error('No invoice URL returned by provider');
      }
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Invoice generation failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Retry Shipment
  const handleRetry = async (shipmentId) => {
    setActionLoadingId(shipmentId);
    try {
      const res = await shippingAPI.retryShipment(shipmentId);
      toast.success(res.data?.message || 'Shipment retry dispatched!');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Retry failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Create Shipment Modal
  const handleOpenCreateModal = async () => {
    setCreateModalOpen(true);
    try {
      const ordersRes = await orderAPI.getAll({ limit: 50 });
      const ordersList = ordersRes.data?.orders || ordersRes.data || [];
      // Filter orders that are confirmed/paid and don't yet have a delivered/shipped shipment
      const filtered = ordersList.filter(
        (o) =>
          o.shipping_status !== 'DELIVERED' &&
          (o.status === 'confirmed' || o.status === 'processing' || o.payment_status === 'paid' || o.payment_method === 'cod')
      );
      setEligibleOrders(filtered);
      if (filtered.length > 0) setSelectedOrderId(filtered[0].id);
    } catch (err) {
      console.error('Failed to load eligible orders:', err);
    }
  };

  // Execute Create Shipment
  const handleCreateShipmentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrderId) {
      toast.error('Please select an order to ship');
      return;
    }
    setCreateLoading(true);
    try {
      const res = await shippingAPI.createShipment(selectedOrderId);
      toast.success(res.data?.message || 'Shipment registered successfully!');
      setCreateModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Shipment creation failed');
    } finally {
      setCreateLoading(false);
    }
  };

  // Run Serviceability Calculator
  const handleCalculateServiceability = async (e) => {
    e.preventDefault();
    if (!calcDeliveryPin || calcDeliveryPin.length !== 6) {
      toast.error('Enter a valid 6-digit delivery PIN code');
      return;
    }
    setCalcLoading(true);
    setCalcResult(null);
    try {
      const res = await shippingAPI.checkServiceability({
        pickup_postcode: calcPickupPin,
        delivery_postcode: calcDeliveryPin,
        weight: parseFloat(calcWeight) || 0.5,
        cod: calcCod,
      });
      setCalcResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'PIN code check failed');
    } finally {
      setCalcLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const map = {
      READY_TO_SHIP: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      AWB_ASSIGNED: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      PICKUP_SCHEDULED: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      PICKED_UP: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
      IN_TRANSIT: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      OUT_FOR_DELIVERY: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      DELIVERED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      FAILED: 'bg-red-500/10 text-red-400 border-red-500/30',
      CANCELLED: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
    };
    const cls = map[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
        {status?.replace(/_/g, ' ') || 'PENDING'}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ── Page Header ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gold-500/10 border border-gold-500/30 rounded-xl">
                <HiTruck className="w-8 h-8 text-gold-400" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
                  Shipping & Logistics Operations
                </h1>
                <p className="text-gray-400 text-sm mt-1">
                  Shiprocket Automated Logistics Engine • Courier Routing, AWB Assignment, Pickups & Realtime Tracking
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setCalcDrawerOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gold-400 border border-gold-500/30 rounded-xl text-sm font-semibold transition-all shadow-sm"
            >
              <HiSearch className="w-4 h-4" />
              <span>Check PIN / Rates</span>
            </button>

            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-dark-900 rounded-xl text-sm font-bold transition-all shadow-md"
            >
              <HiPlusCircle className="w-5 h-5" />
              <span>Create Shipment</span>
            </button>

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2.5 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-xl border border-dark-600 transition-colors"
              title="Refresh Logistics Data"
            >
              <HiRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Metric Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Shipments', val: statistics?.total_shipments ?? shipments.length, color: 'text-white' },
          { label: 'Ready to Ship', val: statistics?.pending ?? 0, color: 'text-yellow-400' },
          { label: 'AWB Assigned', val: statistics?.awb_assigned ?? 0, color: 'text-blue-400' },
          { label: 'In Transit', val: statistics?.in_transit ?? 0, color: 'text-cyan-400' },
          { label: 'Delivered', val: statistics?.delivered ?? 0, color: 'text-emerald-400' },
          { label: 'Delayed', val: statistics?.delayed ?? 0, color: 'text-red-400' },
        ].map((m, idx) => (
          <div key={idx} className="bg-dark-800 border border-dark-600/70 rounded-2xl p-4 shadow-lg">
            <span className="text-xs text-gray-400 font-medium">{m.label}</span>
            <div className={`text-2xl font-bold mt-1 ${m.color}`}>{m.val}</div>
          </div>
        ))}
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {[
            { id: 'all', label: 'All Shipments' },
            { id: 'READY_TO_SHIP', label: 'Ready to Ship' },
            { id: 'AWB_ASSIGNED', label: 'AWB Assigned' },
            { id: 'PICKUP_SCHEDULED', label: 'Pickup Scheduled' },
            { id: 'IN_TRANSIT', label: 'In Transit' },
            { id: 'DELIVERED', label: 'Delivered' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? 'bg-gold-500 text-dark-900 shadow-md shadow-gold-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-80">
          <div className="relative flex-1">
            <HiSearch className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search AWB, order ID, courier..."
              className="w-full bg-dark-900 border border-dark-600 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 bg-dark-700 hover:bg-dark-600 text-gray-200 text-xs font-semibold rounded-xl border border-dark-600 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* ── Shipments Table ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-9 h-9 border-2 border-gold-500/20 border-t-gold-500 rounded-full animate-spin" />
            <span className="text-xs text-gold-400 font-medium">Loading shipments...</span>
          </div>
        ) : shipments.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm space-y-2">
            <HiCube className="w-12 h-12 mx-auto text-gray-600 opacity-50" />
            <p>No shipments found matching your current filter.</p>
            <p className="text-xs text-gray-500">Click &ldquo;Create Shipment&rdquo; to dispatch confirmed customer orders.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-dark-900/60 text-gray-400 uppercase tracking-wider text-[11px] border-b border-dark-700">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Order / Shipment</th>
                  <th className="py-3.5 px-4 font-semibold">Destination</th>
                  <th className="py-3.5 px-4 font-semibold">Package Specs</th>
                  <th className="py-3.5 px-4 font-semibold">Courier & AWB</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold">Payment</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/60">
                {shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-dark-700/30 transition-colors">
                    {/* Order & Shipment IDs */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white font-mono">
                        {s.orders?.order_number || s.provider_order_id || `ORD-${s.order_id?.slice(0, 8)}`}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                        Shipment ID: {s.provider_shipment_id || s.id.slice(0, 8)}
                      </div>
                    </td>

                    {/* Customer & Destination */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-gray-200">
                        {s.orders?.shipping_full_name || 'Customer'}
                      </div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                        <HiLocationMarker className="w-3.5 h-3.5 text-gold-400/80 flex-shrink-0" />
                        <span>
                          {s.orders?.shipping_city || 'City'}, {s.orders?.shipping_state || ''} {s.orders?.shipping_pincode || ''}
                        </span>
                      </div>
                    </td>

                    {/* Package Specs */}
                    <td className="py-3.5 px-4 font-mono">
                      <div>{s.package_weight || 0.5} kg</div>
                      <div className="text-[10px] text-gray-400">
                        {s.package_length || 20}x{s.package_breadth || 20}x{s.package_height || 10} cm
                      </div>
                    </td>

                    {/* Courier & AWB */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-gold-300">
                        {s.courier_name || 'Pending Assignment'}
                      </div>
                      {s.awb_code ? (
                        <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px] text-gray-300">
                          <span>{s.awb_code}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(s.awb_code);
                              toast.success('AWB copied!');
                            }}
                            className="text-gray-400 hover:text-white"
                            title="Copy AWB"
                          >
                            <HiClipboardCopy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-400/80 font-medium">No AWB assigned</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">{getStatusBadge(s.status)}</td>

                    {/* Payment */}
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-white">₹{s.declared_value || s.orders?.total_amount || 0}</span>
                      <div className="text-[10px] text-gray-400 uppercase mt-0.5">
                        {s.payment_method || 'PREPAID'}
                      </div>
                    </td>

                    {/* Actions Menu */}
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {!s.awb_code && (
                        <button
                          onClick={() => handleAssignAwb(s.id)}
                          disabled={actionLoadingId === s.id}
                          className="px-2.5 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Assign AWB
                        </button>
                      )}

                      {s.awb_code && s.status === 'AWB_ASSIGNED' && (
                        <button
                          onClick={() => handleSchedulePickup(s.id)}
                          disabled={actionLoadingId === s.id}
                          className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Schedule Pickup
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenTracking(s)}
                        className="px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-gray-200 border border-dark-600 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Track
                      </button>

                      {s.awb_code && (
                        <button
                          onClick={() => handleGenerateLabel(s.id)}
                          disabled={actionLoadingId === s.id}
                          className="p-1.5 bg-dark-700 hover:bg-dark-600 text-gold-400 border border-dark-600 rounded-lg transition-colors inline-block"
                          title="Print Shipping Label"
                        >
                          <HiDocumentDownload className="w-4 h-4" />
                        </button>
                      )}

                      {s.status === 'FAILED' && (
                        <button
                          onClick={() => handleRetry(s.id)}
                          disabled={actionLoadingId === s.id}
                          className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL: Live Tracking Timeline ── */}
      {trackingModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-600 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-dark-700 pb-3">
              <div className="flex items-center gap-2">
                <HiTruck className="w-6 h-6 text-gold-400" />
                <h3 className="text-base font-serif font-bold text-white">Live Courier Tracking</h3>
              </div>
              <button
                onClick={() => setTrackingModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            {trackingLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-gold-500/20 border-t-gold-500 rounded-full animate-spin" />
                <span className="text-xs text-gray-400">Querying courier partner scans...</span>
              </div>
            ) : activeTracking ? (
              <div className="space-y-4">
                <div className="bg-dark-900/70 border border-dark-700 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Courier Partner</span>
                    <span className="font-semibold text-white">{activeTracking.courier_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">AWB Tracking Code</span>
                    <span className="font-mono text-xs text-gold-400 font-bold">{activeTracking.awb_code}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Current Milestone</span>
                    <span className="text-xs font-semibold text-emerald-400">
                      {activeTracking.normalized_status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {activeTracking.estimated_delivery_date && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Estimated Delivery</span>
                      <span className="text-xs text-gray-200">{activeTracking.estimated_delivery_date}</span>
                    </div>
                  )}
                </div>

                {/* Scans Timeline */}
                <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                  <span className="text-xs font-semibold text-gray-300 block">Milestones & Scans</span>
                  {activeTracking.scans && activeTracking.scans.length > 0 ? (
                    activeTracking.scans.map((scan, sIdx) => (
                      <div key={sIdx} className="flex items-start gap-3 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full bg-gold-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-white font-medium">{scan.activity}</p>
                          <p className="text-gray-400 text-[11px] mt-0.5">
                            {scan.location} • {new Date(scan.date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 italic py-2">
                      Package is prepared and waiting for the courier partner scan.
                    </p>
                  )}
                </div>

                {activeTracking.tracking_url && (
                  <a
                    href={activeTracking.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 bg-gold-500 hover:bg-gold-400 text-dark-900 font-semibold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors shadow-md"
                  >
                    <span>Track on Official Courier Portal</span>
                    <HiExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── MODAL: Create Shipment ── */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-600 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-dark-700 pb-3">
              <div className="flex items-center gap-2">
                <HiPlusCircle className="w-6 h-6 text-gold-400" />
                <h3 className="text-base font-serif font-bold text-white">Dispatch Order via Shiprocket</h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateShipmentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Select Confirmed Customer Order
                </label>
                {eligibleOrders.length === 0 ? (
                  <p className="text-xs text-amber-400/90 py-2">
                    No pending orders requiring new shipments found.
                  </p>
                ) : (
                  <select
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                  >
                    {eligibleOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.order_number || o.id.slice(0, 8)} — {o.shipping_full_name || 'Customer'} (₹{o.total_amount}, {o.payment_method?.toUpperCase()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="bg-dark-900/60 p-3 rounded-xl border border-dark-700 text-xs text-gray-400 space-y-1">
                <p>📦 <strong>Package Defaults:</strong> 0.5 kg • 20x20x10 cm</p>
                <p>📍 <strong>Pickup:</strong> Artisan workshop or platform default</p>
                <p>🛡️ <strong>Safety:</strong> Prepaid orders require confirmed payment</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading || eligibleOrders.length === 0}
                  className="px-5 py-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-dark-900 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md"
                >
                  {createLoading ? 'Registering...' : 'Dispatch Shipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DRAWER / MODAL: Serviceability & Rates Calculator ── */}
      {calcDrawerOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-600 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-dark-700 pb-3">
              <div className="flex items-center gap-2">
                <HiSearch className="w-6 h-6 text-gold-400" />
                <h3 className="text-base font-serif font-bold text-white">Courier Rate & PIN Checker</h3>
              </div>
              <button
                onClick={() => setCalcDrawerOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCalculateServiceability} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Pickup PIN</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={calcPickupPin}
                    onChange={(e) => setCalcPickupPin(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Delivery PIN *</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={calcDeliveryPin}
                    onChange={(e) => setCalcDeliveryPin(e.target.value)}
                    placeholder="e.g. 110001"
                    className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={calcWeight}
                    onChange={(e) => setCalcWeight(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={calcCod}
                      onChange={(e) => setCalcCod(e.target.checked)}
                      className="rounded bg-dark-900 border-dark-600 text-gold-500"
                    />
                    <span>Cash on Delivery (COD)</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={calcLoading}
                className="w-full py-2.5 bg-gold-500 hover:bg-gold-400 text-dark-900 font-bold rounded-xl text-xs transition-colors shadow-md"
              >
                {calcLoading ? 'Calculating Rates...' : 'Calculate Courier Rates'}
              </button>
            </form>

            {calcResult && (
              <div className="mt-4 pt-3 border-t border-dark-700 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Serviceable Couriers:</span>
                  <span className="font-semibold text-emerald-400">
                    {calcResult.serviceable ? `✓ ${calcResult.available_couriers_count} Couriers Available` : '✗ Not Serviceable'}
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {calcResult.couriers?.map((c, cIdx) => (
                    <div
                      key={cIdx}
                      className="bg-dark-900/80 border border-dark-700 rounded-xl p-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">{c.courier_name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Est: {c.estimated_delivery_days} • Rating: ★ {c.rating}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-gold-400 text-sm">₹{c.rate}</span>
                        <p className="text-[10px] text-gray-500">{c.cod_available ? 'COD Available' : 'Prepaid Only'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
