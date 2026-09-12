import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../models/order.dart';
import '../../services/order_service.dart';

class OrderTrackingScreen extends ConsumerStatefulWidget {
  final String? initialOrderId;

  const OrderTrackingScreen({super.key, this.initialOrderId});

  @override
  ConsumerState<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends ConsumerState<OrderTrackingScreen> {
  final _orderService = OrderService();
  final _orderIdController = TextEditingController();
  Future<OrderModel>? _orderFuture;
  Future<List<OrderModel>>? _userOrdersFuture;

  @override
  void initState() {
    super.initState();
    if (widget.initialOrderId != null && widget.initialOrderId!.isNotEmpty) {
      _orderIdController.text = widget.initialOrderId!;
      _orderFuture = _orderService.getOrderTracking(widget.initialOrderId!);
    } else {
      _userOrdersFuture = _orderService.getUserOrders();
    }
  }

  @override
  void dispose() {
    _orderIdController.dispose();
    super.dispose();
  }

  void _searchOrder() {
    final id = _orderIdController.text.trim();
    if (id.isEmpty) return;
    setState(() {
      _orderFuture = _orderService.getOrderTracking(id);
    });
  }

  @override
  Widget build(BuildContext context) {
    final currencyFormatter = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Order Tracking',
          style: GoogleFonts.playfairDisplay(fontWeight: FontWeight.w700),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Search Input
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _orderIdController,
                    decoration: const InputDecoration(
                      hintText: 'Enter Order ID (e.g., ord_12345)',
                      prefixIcon: Icon(Icons.receipt_long),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                ElevatedButton(
                  onPressed: _searchOrder,
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(60, 50),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  child: const Icon(Icons.search),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // If an explicit order is being tracked:
            if (_orderFuture != null)
              FutureBuilder<OrderModel>(
                future: _orderFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(32.0),
                        child: CircularProgressIndicator(color: AppTheme.artisanTerracotta),
                      ),
                    );
                  }
                  if (snapshot.hasError) {
                    return Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppTheme.crimsonAlert.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.crimsonAlert.withOpacity(0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, color: AppTheme.crimsonAlert),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Could not locate order: ${snapshot.error.toString().replaceAll("Exception: ", "")}',
                              style: const TextStyle(color: AppTheme.crimsonAlert),
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  final order = snapshot.data!;
                  return _buildTrackingCard(order, currencyFormatter);
                },
              )
            else if (_userOrdersFuture != null)
              FutureBuilder<List<OrderModel>>(
                future: _userOrdersFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(32.0),
                        child: CircularProgressIndicator(color: AppTheme.artisanTerracotta),
                      ),
                    );
                  }
                  if (snapshot.hasError || !snapshot.hasData || snapshot.data!.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          children: [
                            const Icon(Icons.inventory_2_outlined, size: 48, color: Color(0xFF94A3B8)),
                            const SizedBox(height: 12),
                            const Text('No past orders found.'),
                            const SizedBox(height: 12),
                            ElevatedButton(
                              onPressed: () => context.go('/home'),
                              child: const Text('Browse Crafts'),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  final orders = snapshot.data!;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Your Recent Orders',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.royalIndigo,
                        ),
                      ),
                      const SizedBox(height: 12),
                      ...orders.map((o) => Padding(
                            padding: const EdgeInsets.only(bottom: 16.0),
                            child: _buildTrackingCard(o, currencyFormatter),
                          )),
                    ],
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTrackingCard(OrderModel order, NumberFormat currencyFormatter) {
    final status = order.orderStatus.toLowerCase();
    int currentStep = 0;
    if (status == 'confirmed') currentStep = 1;
    if (status == 'shipped' || status == 'dispatched') currentStep = 2;
    if (status == 'out_for_delivery') currentStep = 3;
    if (status == 'delivered') currentStep = 4;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Order #${order.id.length > 8 ? order.id.substring(0, 8) : order.id}',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.artisanGold.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  order.orderStatus.toUpperCase(),
                  style: const TextStyle(
                    color: Color(0xFFB45309),
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Total: ${currencyFormatter.format(order.totalAmount)} • Payment: ${order.paymentStatus.toUpperCase()}',
            style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
          ),
          if (order.shippingAddress != null) ...[
            const SizedBox(height: 6),
            Text(
              'Delivering to: ${order.shippingAddress}',
              style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
            ),
          ],
          const Divider(height: 28),

          // Status Timeline
          _buildTimelineStep(0, 'Order Placed', 'Craft order verified in system', currentStep >= 0),
          _buildTimelineStep(1, 'Artisan Confirmed', 'Craftsperson preparing item with care', currentStep >= 1),
          _buildTimelineStep(2, 'Dispatched', 'Handed over to courier with tracking', currentStep >= 2),
          _buildTimelineStep(3, 'Out for Delivery', 'Reaching your doorstep today', currentStep >= 3),
          _buildTimelineStep(4, 'Delivered', 'Enjoy your authentic Indian craft', currentStep >= 4, isLast: true),

          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(
              children: [
                Icon(Icons.chat, color: Color(0xFF25D366), size: 20),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Twilio WhatsApp live order updates are active for this shipment.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF334155)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineStep(int stepIndex, String title, String subtitle, bool isCompleted, {bool isLast = false}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isCompleted ? AppTheme.emeraldSuccess : const Color(0xFFE2E8F0),
              ),
              child: Center(
                child: Icon(
                  isCompleted ? Icons.check : Icons.circle,
                  size: 12,
                  color: isCompleted ? Colors.white : const Color(0xFF94A3B8),
                ),
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 36,
                color: isCompleted ? AppTheme.emeraldSuccess : const Color(0xFFE2E8F0),
              ),
          ],
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: isCompleted ? AppTheme.royalIndigo : const Color(0xFF94A3B8),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 11,
                  color: isCompleted ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ],
    );
  }
}
