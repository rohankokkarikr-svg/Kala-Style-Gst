import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../config/theme.dart';
import '../../providers/products_provider.dart';
import '../../services/ai_service.dart';
import '../../services/product_service.dart';

class AiStudioScreen extends ConsumerStatefulWidget {
  final Map<String, dynamic> initialData;

  const AiStudioScreen({super.key, required this.initialData});

  @override
  ConsumerState<AiStudioScreen> createState() => _AiStudioScreenState();
}

class _AiStudioScreenState extends ConsumerState<AiStudioScreen> {
  final _formKey = GlobalKey<FormState>();
  final _productService = ProductService();
  final _aiService = AiService();

  late final TextEditingController _titleController;
  late final TextEditingController _descController;
  late final TextEditingController _priceController;
  late final TextEditingController _stockController;
  late String _imageUrl;
  late String _category;
  List<String> _tags = [];

  bool _isPublishing = false;
  bool _isRegeneratingDesc = false;

  final List<String> _categories = [
    'Textiles',
    'Pottery',
    'Jewelry',
    'Woodcraft',
    'Paintings',
    'Home Decor',
    'Crafts',
  ];

  @override
  void initState() {
    super.initState();
    _imageUrl = widget.initialData['imageUrl']?.toString() ?? '';
    _titleController = TextEditingController(text: widget.initialData['title']?.toString() ?? '');
    _descController = TextEditingController(text: widget.initialData['description']?.toString() ?? '');
    _priceController = TextEditingController(text: widget.initialData['suggestedPrice']?.toString() ?? '999');
    _stockController = TextEditingController(text: '10');

    final cat = widget.initialData['category']?.toString() ?? 'Crafts';
    _category = _categories.firstWhere(
      (c) => c.toLowerCase() == cat.toLowerCase(),
      orElse: () => 'Crafts',
    );

    if (widget.initialData['tags'] is List) {
      _tags = (widget.initialData['tags'] as List).map((e) => e.toString()).toList();
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _priceController.dispose();
    _stockController.dispose();
    super.dispose();
  }

  Future<void> _regenerateDescription() async {
    setState(() => _isRegeneratingDesc = true);
    try {
      final desc = await _aiService.generateDescription(
        title: _titleController.text.trim(),
        category: _category,
        keywords: _tags.join(', '),
      );
      setState(() {
        _descController.text = desc;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AI regeneration error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isRegeneratingDesc = false);
    }
  }

  Future<void> _publishProduct() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isPublishing = true);

    try {
      final price = double.tryParse(_priceController.text.trim()) ?? 0.0;
      final stock = int.tryParse(_stockController.text.trim()) ?? 1;

      await _productService.createProduct(
        name: _titleController.text.trim(),
        description: _descController.text.trim(),
        price: price,
        stock: stock,
        category: _category,
        images: [_imageUrl],
        tags: _tags,
      );

      // Invalidate products provider so the marketplace refreshes instantly
      ref.invalidate(productsProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Product published live to KalaStyle Marketplace!'),
            backgroundColor: AppTheme.emeraldSuccess,
          ),
        );
        context.go('/artisan');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to publish: ${e.toString().replaceAll("Exception: ", "")}'),
            backgroundColor: AppTheme.crimsonAlert,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isPublishing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Gemini AI Product Studio',
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
              // Photo Thumbnail with AI Badge
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: CachedNetworkImage(
                      imageUrl: _imageUrl,
                      width: 90,
                      height: 90,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => Container(
                        width: 90,
                        height: 90,
                        color: const Color(0xFFF1F5F9),
                        child: const Icon(Icons.image),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.artisanGold.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.auto_awesome, size: 14, color: Color(0xFFB45309)),
                              SizedBox(width: 4),
                              Text(
                                'AI-COMPOSED LISTING',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFFB45309),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Review and fine-tune your listing generated by Google Gemini.',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Product Title
              Text(
                'Product Title',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF334155),
                ),
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(hintText: 'e.g. Handmade Handloom Silk Stole'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter title' : null,
              ),
              const SizedBox(height: 18),

              // Category & Price
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Category',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF334155),
                          ),
                        ),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String>(
                          value: _category,
                          items: _categories.map((c) {
                            return DropdownMenuItem(value: c, child: Text(c));
                          }).toList(),
                          onChanged: (val) {
                            if (val != null) setState(() => _category = val);
                          },
                          decoration: const InputDecoration(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Price (INR ₹)',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF334155),
                          ),
                        ),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _priceController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(prefixText: '₹ '),
                          validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter price' : null,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),

              // Stock
              Text(
                'Units in Stock',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF334155),
                ),
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: _stockController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: '10'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter stock quantity' : null,
              ),
              const SizedBox(height: 18),

              // Heritage Story / Description
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Craft Story & Description',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF334155),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _isRegeneratingDesc ? null : _regenerateDescription,
                    icon: _isRegeneratingDesc
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.refresh, size: 16),
                    label: const Text('Re-compose', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: _descController,
                maxLines: 5,
                decoration: const InputDecoration(
                  hintText: 'Heritage description generated by Gemini AI...',
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter craft description' : null,
              ),
              const SizedBox(height: 18),

              // Tags
              if (_tags.isNotEmpty) ...[
                Text(
                  'Suggested Tags',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF334155),
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: _tags.map((t) {
                    return Chip(
                      label: Text('#$t', style: const TextStyle(fontSize: 12)),
                      backgroundColor: const Color(0xFFF1F5F9),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 24),
              ],

              // Publish CTA
              ElevatedButton.icon(
                onPressed: _isPublishing ? null : _publishProduct,
                icon: const Icon(Icons.cloud_upload_outlined),
                label: _isPublishing
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Publish Product Live to Store'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.artisanTerracotta,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
