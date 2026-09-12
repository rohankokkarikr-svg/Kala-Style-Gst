import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../models/order.dart';
import '../../providers/auth_provider.dart';
import '../../services/order_service.dart';

class ArtisanDashboardScreen extends ConsumerStatefulWidget {
  const ArtisanDashboardScreen({super.key});

  @override
  ConsumerState<ArtisanDashboardScreen> createState() => _ArtisanDashboardScreenState();
}

class _ArtisanDashboardScreenState extends ConsumerState<ArtisanDashboardScreen> {
  final _orderService = OrderService();
  late Future<List<OrderModel>> _artisanOrdersFuture;

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  void _loadOrders() {
    setState(() {
      _artisanOrdersFuture = _orderService.getArtisanOrders();
    });
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final user = authState.user;
    final currencyFormatter = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Icon(Icons.storefront, color: AppTheme.artisanTerracotta),
            const SizedBox(width: 8),
            Text(
              'Artisan Studio',
              style: GoogleFonts.playfairDisplay(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.shopping_bag_outlined),
            tooltip: 'View Marketplace',
            onPressed: () => context.go('/home'),
          ),
          if (user?.isAdmin == true)
            IconButton(
              icon: const Icon(Icons.admin_panel_settings_outlined),
              tooltip: 'AI Admin Manager',
              onPressed: () => context.go('/admin'),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _loadOrders(),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Welcome Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Namaste, ${user?.fullName ?? "Master Artisan"}',
                        style: GoogleFonts.playfairDisplay(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.royalIndigo,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Empowering your craft with Gemini AI',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.artisanGold.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.star, color: AppTheme.artisanGold, size: 16),
                        SizedBox(width: 4),
                        Text(
                          '4.9 (Master)',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFB45309)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // AI One-Click Upload Hero Banner
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.artisanTerracotta, Color(0xFF9C3A16)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.artisanTerracotta.withOpacity(0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(Icons.camera_alt, color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          'One-Click AI Product Studio',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Take a photo of your craft. Gemini AI will write heritage stories, detect category, suggest fair pricing, and publish directly to online patrons.',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        color: Colors.white.withOpacity(0.9),
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => context.push('/artisan/add-product'),
                      icon: const Icon(Icons.auto_awesome, color: AppTheme.royalIndigo),
                      label: const Text('Capture & Create Product'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.artisanGold,
                        foregroundColor: AppTheme.royalIndigo,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // KPI Metrics Row
              Text(
                'Performance Overview',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.royalIndigo,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _buildMetricCard(
                      'Earnings',
                      currencyFormatter.format(24500),
                      Icons.account_balance_wallet,
                      AppTheme.emeraldSuccess,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildMetricCard(
                      'Fulfillments',
                      '18 Orders',
                      Icons.local_shipping,
                      AppTheme.artisanGold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 28),

              // Orders to Fulfill
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Recent Customer Orders',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.royalIndigo,
                    ),
                  ),
                  TextButton(
                    onPressed: () => context.push('/artisan/orders'),
                    child: const Text('View All', style: TextStyle(color: AppTheme.artisanTerracotta)),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              FutureBuilder<List<OrderModel>>(
                future: _artisanOrdersFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24.0),
                        child: CircularProgressIndicator(color: AppTheme.artisanTerracotta),
                      ),
                    );
                  }
                  if (snapshot.hasError || !snapshot.hasData || snapshot.data!.isEmpty) {
                    return Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: const Column(
                        children: [
                          Icon(Icons.inventory_2_outlined, size: 40, color: Color(0xFF94A3B8)),
                          SizedBox(height: 8),
                          Text('No active orders right now.', style: TextStyle(color: Color(0xFF64748B))),
                        ],
                      ),
                    );
                  }

                  final orders = snapshot.data!;
                  return Column(
                    children: orders.take(3).map((o) => _buildOrderActionCard(o, currencyFormatter)).toList(),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOrderActionCard(OrderModel order, NumberFormat currencyFormatter) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Order #${order.id.length > 8 ? order.id.substring(0, 8) : order.id}',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              ),
              Text(
                currencyFormatter.format(order.totalAmount),
                style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.royalIndigo),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Recipient: ${order.customerName ?? "Customer"} • Status: ${order.orderStatus}',
            style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
          ),
          const Divider(height: 18),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (order.orderStatus.toLowerCase() == 'placed')
                OutlinedButton(
                  onPressed: () => _updateStatus(order.id, 'confirmed'),
                  child: const Text('Confirm Order'),
                ),
              if (order.orderStatus.toLowerCase() == 'confirmed')
                ElevatedButton(
                  onPressed: () => _updateStatus(order.id, 'shipped'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.royalIndigo,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(120, 36),
                  ),
                  child: const Text('Dispatch / Ship'),
                ),
              if (order.orderStatus.toLowerCase() == 'shipped')
                ElevatedButton(
                  onPressed: () => _updateStatus(order.id, 'delivered'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.emeraldSuccess,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(120, 36),
                  ),
                  child: const Text('Mark Delivered'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _updateStatus(String orderId, String newStatus) async {
    try {
      await _orderService.updateOrderStatus(orderId, newStatus);
      _loadOrders();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Order status updated to $newStatus')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Update failed: $e'), backgroundColor: AppTheme.crimsonAlert),
        );
      }
    }
  }
}
