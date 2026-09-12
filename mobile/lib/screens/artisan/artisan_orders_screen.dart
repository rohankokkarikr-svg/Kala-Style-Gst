import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../models/order.dart';
import '../../services/order_service.dart';

class ArtisanOrdersScreen extends StatefulWidget {
  const ArtisanOrdersScreen({super.key});

  @override
  State<ArtisanOrdersScreen> createState() => _ArtisanOrdersScreenState();
}

class _ArtisanOrdersScreenState extends State<ArtisanOrdersScreen> {
  final _orderService = OrderService();
  late Future<List<OrderModel>> _ordersFuture;
  String _selectedFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  void _loadOrders() {
    setState(() {
      _ordersFuture = _orderService.getArtisanOrders();
    });
  }

  @override
  Widget build(BuildContext context) {
    final currencyFormatter = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Artisan Orders',
          style: GoogleFonts.playfairDisplay(fontWeight: FontWeight.w700),
        ),
      ),
      body: Column(
        children: [
          // Filter Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                _buildFilterChip('all', 'All Orders'),
                const SizedBox(width: 8),
                _buildFilterChip('placed', 'New Placed'),
                const SizedBox(width: 8),
                _buildFilterChip('confirmed', 'In Production'),
                const SizedBox(width: 8),
                _buildFilterChip('shipped', 'Shipped'),
                const SizedBox(width: 8),
                _buildFilterChip('delivered', 'Delivered'),
              ],
            ),
          ),

          // Orders List
          Expanded(
            child: FutureBuilder<List<OrderModel>>(
              future: _ordersFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: CircularProgressIndicator(color: AppTheme.artisanTerracotta),
                  );
                }
                if (snapshot.hasError || !snapshot.hasData || snapshot.data!.isEmpty) {
                  return const Center(
                    child: Text('No orders found matching this filter.'),
                  );
                }

                var filtered = snapshot.data!;
                if (_selectedFilter != 'all') {
                  filtered = filtered.where((o) => o.orderStatus.toLowerCase() == _selectedFilter).toList();
                }

                if (filtered.isEmpty) {
                  return const Center(
                    child: Text('No orders in this category.'),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final order = filtered[index];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 14),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Order #${order.id.length > 8 ? order.id.substring(0, 8) : order.id}',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppTheme.artisanTerracotta.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    order.orderStatus.toUpperCase(),
                                    style: const TextStyle(
                                      color: AppTheme.artisanTerracotta,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 11,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text('Customer: ${order.customerName ?? "Patron"}'),
                            if (order.customerPhone != null)
                              Text('Phone / WhatsApp: ${order.customerPhone}'),
                            if (order.shippingAddress != null)
                              Text('Address: ${order.shippingAddress}'),
                            const SizedBox(height: 6),
                            Text(
                              'Total Amount: ${currencyFormatter.format(order.totalAmount)}',
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            const Divider(height: 20),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                if (order.orderStatus.toLowerCase() == 'placed')
                                  ElevatedButton(
                                    onPressed: () => _update(order.id, 'confirmed'),
                                    child: const Text('Accept & Prepare'),
                                  ),
                                if (order.orderStatus.toLowerCase() == 'confirmed')
                                  ElevatedButton(
                                    onPressed: () => _update(order.id, 'shipped'),
                                    child: const Text('Dispatch / Handover'),
                                  ),
                                if (order.orderStatus.toLowerCase() == 'shipped')
                                  ElevatedButton(
                                    onPressed: () => _update(order.id, 'delivered'),
                                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.emeraldSuccess),
                                    child: const Text('Mark Delivered'),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String key, String label) {
    final isSelected = _selectedFilter == key;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => setState(() => _selectedFilter = key),
      selectedColor: AppTheme.royalIndigo,
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : const Color(0xFF475569),
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
    );
  }

  Future<void> _update(String id, String status) async {
    try {
      await _orderService.updateOrderStatus(id, status);
      _loadOrders();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppTheme.crimsonAlert),
        );
      }
    }
  }
}
