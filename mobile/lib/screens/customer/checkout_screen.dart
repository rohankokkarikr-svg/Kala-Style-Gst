import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';
import '../../services/order_service.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _streetController = TextEditingController();
  final _cityController = TextEditingController();
  final _stateController = TextEditingController();
  final _pincodeController = TextEditingController();

  String _paymentMethod = 'razorpay'; // 'razorpay' or 'cod'
  bool _isPlacingOrder = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    if (user != null) {
      _nameController.text = user.fullName ?? '';
      _phoneController.text = user.phone ?? '';
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _streetController.dispose();
    _cityController.dispose();
    _stateController.dispose();
    _pincodeController.dispose();
    super.dispose();
  }

  Future<void> _placeOrder() async {
    if (!_formKey.currentState!.validate()) return;

    final authState = ref.read(authProvider);
    if (authState.status != AuthStatus.authenticated || authState.user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please sign in to place your artisan order.'),
          backgroundColor: AppTheme.artisanTerracotta,
        ),
      );
      context.push('/login');
      return;
    }

    final cartState = ref.read(cartProvider);
    if (cartState.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your shopping bag is empty.')),
      );
      return;
    }

    setState(() => _isPlacingOrder = true);

    try {
      final fullAddress = '${_streetController.text.trim()}, ${_cityController.text.trim()}, ${_stateController.text.trim()} - ${_pincodeController.text.trim()}';

      final itemsPayload = cartState.itemList.map((i) {
        return {
          'product_id': i.product.id,
          'title': i.product.name,
          'price': i.product.price,
          'quantity': i.quantity,
          'image': i.product.primaryImage,
        };
      }).toList();

      final orderService = OrderService();
      final order = await orderService.createOrder(
        items: itemsPayload,
        phone: _phoneController.text.trim(),
        shippingAddress: fullAddress,
        shippingName: _nameController.text.trim(),
        shippingCity: _cityController.text.trim(),
        shippingState: _stateController.text.trim(),
        shippingPincode: _pincodeController.text.trim(),
        paymentMethod: _paymentMethod,
      );

      // Clear bag upon order creation
      ref.read(cartProvider.notifier).clearCart();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Order placed successfully! WhatsApp confirmation sent.'),
            backgroundColor: AppTheme.emeraldSuccess,
          ),
        );
        context.go('/orders/track?orderId=${order.id}');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to place order: ${e.toString().replaceAll("Exception: ", "")}'),
            backgroundColor: AppTheme.crimsonAlert,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isPlacingOrder = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cartState = ref.watch(cartProvider);
    final currencyFormatter = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Checkout',
          style: GoogleFonts.playfairDisplay(fontWeight: FontWeight.w700),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Shipping Destination',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.royalIndigo,
                ),
              ),
              const SizedBox(height: 14),

              // Full Name & Phone
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Recipient Full Name',
                  prefixIcon: Icon(Icons.person_outline),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter recipient name' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Mobile Phone (for WhatsApp updates)',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter mobile number' : null,
              ),
              const SizedBox(height: 12),

              // Street Address
              TextFormField(
                controller: _streetController,
                decoration: const InputDecoration(
                  labelText: 'House / Flat / Street / Landmark',
                  prefixIcon: Icon(Icons.home_outlined),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter street address' : null,
              ),
              const SizedBox(height: 12),

              // City & PIN code row
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _cityController,
                      decoration: const InputDecoration(labelText: 'City'),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter city' : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _pincodeController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'PIN Code'),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter PIN' : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // State
              TextFormField(
                controller: _stateController,
                decoration: const InputDecoration(
                  labelText: 'State (e.g., Rajasthan, Karnataka)',
                  prefixIcon: Icon(Icons.map_outlined),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter state' : null,
              ),
              const SizedBox(height: 28),

              // Payment Method
              Text(
                'Payment Method',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.royalIndigo,
                ),
              ),
              const SizedBox(height: 12),

              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  children: [
                    RadioListTile<String>(
                      value: 'razorpay',
                      groupValue: _paymentMethod,
                      title: const Text('Razorpay Secure (UPI / Cards / NetBanking)'),
                      subtitle: const Text('Instant confirmation & digital receipt', style: TextStyle(fontSize: 12)),
                      secondary: const Icon(Icons.credit_card, color: AppTheme.artisanGold),
                      onChanged: (val) => setState(() => _paymentMethod = val!),
                    ),
                    const Divider(height: 1),
                    RadioListTile<String>(
                      value: 'cod',
                      groupValue: _paymentMethod,
                      title: const Text('Cash on Delivery (COD)'),
                      subtitle: const Text('Pay when the craft arrives at your door', style: TextStyle(fontSize: 12)),
                      secondary: const Icon(Icons.local_shipping, color: AppTheme.artisanTerracotta),
                      onChanged: (val) => setState(() => _paymentMethod = val!),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              // Summary
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Items count:'),
                        Text('${cartState.itemCount} items', style: const TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Payable Total:'),
                        Text(
                          currencyFormatter.format(cartState.totalAmount),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.royalIndigo,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              ElevatedButton(
                onPressed: _isPlacingOrder ? null : _placeOrder,
                child: _isPlacingOrder
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text('Place Order • ${currencyFormatter.format(cartState.totalAmount)}'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
