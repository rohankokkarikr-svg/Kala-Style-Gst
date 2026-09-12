import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../providers/cart_provider.dart';
import '../../providers/products_provider.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;

  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  int _selectedImageIndex = 0;
  int _quantity = 1;

  @override
  Widget build(BuildContext context) {
    final productAsync = ref.watch(productDetailProvider(widget.productId));
    final currencyFormatter = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return Scaffold(
      body: productAsync.when(
        data: (product) {
          final images = product.images.isNotEmpty
              ? product.images
              : [product.primaryImage];

          return CustomScrollView(
            slivers: [
              // Image AppBar
              SliverAppBar(
                expandedHeight: 380,
                pinned: true,
                leading: Container(
                  margin: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.9),
                    shape: BoxShape.circle,
                  ),
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back, color: AppTheme.royalIndigo),
                    onPressed: () => context.pop(),
                  ),
                ),
                actions: [
                  Container(
                    margin: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.9),
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.shopping_bag_outlined, color: AppTheme.royalIndigo),
                      onPressed: () => context.push('/cart'),
                    ),
                  ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      CachedNetworkImage(
                        imageUrl: images[_selectedImageIndex],
                        fit: BoxFit.cover,
                        placeholder: (_, __) => Container(
                          color: const Color(0xFFF1F5F9),
                          child: const Center(
                            child: CircularProgressIndicator(color: AppTheme.artisanTerracotta),
                          ),
                        ),
                        errorWidget: (_, __, ___) => const Center(child: Icon(Icons.broken_image, size: 48)),
                      ),
                      // Thumbnails overlay if multiple images
                      if (images.length > 1)
                        Positioned(
                          bottom: 16,
                          left: 0,
                          right: 0,
                          child: Center(
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.55),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: List.generate(images.length, (idx) {
                                  final isSelected = idx == _selectedImageIndex;
                                  return GestureDetector(
                                    onTap: () => setState(() => _selectedImageIndex = idx),
                                    child: Container(
                                      margin: const EdgeInsets.symmetric(horizontal: 4),
                                      width: isSelected ? 22 : 8,
                                      height: 8,
                                      decoration: BoxDecoration(
                                        color: isSelected ? AppTheme.artisanGold : Colors.white54,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                    ),
                                  );
                                }),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),

              // Product Info Body
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Category & Artisan Provenance
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppTheme.royalIndigo.withOpacity(0.08),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              product.category.toUpperCase(),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.royalIndigo,
                              ),
                            ),
                          ),
                          const Spacer(),
                          const Icon(Icons.verified, color: AppTheme.emeraldSuccess, size: 16),
                          const SizedBox(width: 4),
                          Text(
                            product.artisanName ?? 'Authentic Master Artisan',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.artisanTerracotta,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      // Title
                      Text(
                        product.name,
                        style: GoogleFonts.playfairDisplay(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.royalIndigo,
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Price & Stock
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            currencyFormatter.format(product.price),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              color: AppTheme.royalIndigo,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            product.stock > 0 ? 'In Stock (${product.stock} left)' : 'Out of Stock',
                            style: TextStyle(
                              color: product.stock > 0 ? AppTheme.emeraldSuccess : AppTheme.crimsonAlert,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 32),

                      // Craftsmanship Story
                      Text(
                        'Craftsmanship & Story',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.royalIndigo,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        product.description.isNotEmpty
                            ? product.description
                            : 'Handmade with timeless dedication by traditional Indian artisans. Every piece reflects generations of cultural heritage, natural materials, and authentic regional technique.',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          height: 1.6,
                          color: const Color(0xFF475569),
                        ),
                      ),
                      const SizedBox(height: 24),

                      // Heritage Guarantees
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFE2E8F0)),
                        ),
                        child: Column(
                          children: [
                            _buildHeritagePoint(Icons.eco_outlined, 'Sustainable & Handcrafted', 'Created using earth-friendly materials and ethical artisan labor.'),
                            const SizedBox(height: 12),
                            _buildHeritagePoint(Icons.local_shipping_outlined, 'Direct from Artisan Cluster', 'Ships straight from the maker’s atelier with live tracking.'),
                            const SizedBox(height: 12),
                            _buildHeritagePoint(Icons.security_outlined, 'Fair Wage Guarantee', '100% of the proceeds directly empower the artisan family.'),
                          ],
                        ),
                      ),
                      const SizedBox(height: 100), // padding for bottom bar
                    ],
                  ),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.artisanTerracotta),
        ),
        error: (err, _) => Scaffold(
          appBar: AppBar(),
          body: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: AppTheme.crimsonAlert),
                const SizedBox(height: 12),
                Text('Error loading product: ${err.toString().replaceAll("Exception: ", "")}'),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => context.pop(),
                  child: const Text('Back to Store'),
                ),
              ],
            ),
          ),
        ),
      ),
      bottomNavigationBar: productAsync.when(
        data: (product) => Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 10,
                offset: const Offset(0, -3),
              ),
            ],
          ),
          child: SafeArea(
            child: Row(
              children: [
                // Quantity Selector
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFCBD5E1)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.remove, size: 18),
                        onPressed: _quantity > 1 ? () => setState(() => _quantity--) : null,
                      ),
                      Text(
                        '$_quantity',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                      IconButton(
                        icon: const Icon(Icons.add, size: 18),
                        onPressed: _quantity < product.stock ? () => setState(() => _quantity++) : null,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),

                // Add to Bag CTA
                Expanded(
                  child: ElevatedButton(
                    onPressed: product.stock > 0
                        ? () {
                            for (int i = 0; i < _quantity; i++) {
                              ref.read(cartProvider.notifier).addItem(product);
                            }
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Added $_quantity × "${product.name}" to Bag'),
                                action: SnackBarAction(
                                  label: 'View Bag',
                                  textColor: AppTheme.artisanGold,
                                  onPressed: () => context.push('/cart'),
                                ),
                              ),
                            );
                          }
                        : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.royalIndigo,
                      foregroundColor: Colors.white,
                    ),
                    child: Text(product.stock > 0 ? 'Add to Bag' : 'Out of Stock'),
                  ),
                ),
              ],
            ),
          ),
        ),
        loading: () => const SizedBox.shrink(),
        error: (_, __) => const SizedBox.shrink(),
      ),
    );
  }

  Widget _buildHeritagePoint(IconData icon, String title, String subtitle) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: AppTheme.artisanTerracotta),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.royalIndigo,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  color: const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
