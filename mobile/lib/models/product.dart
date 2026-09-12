class ProductModel {
  final String id;
  final String name;
  final String description;
  final double price;
  final int stock;
  final String category;
  final List<String> images;
  final String? artisanId;
  final String? artisanName;
  final List<String> tags;
  final DateTime? createdAt;

  ProductModel({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.stock,
    required this.category,
    required this.images,
    this.artisanId,
    this.artisanName,
    this.tags = const [],
    this.createdAt,
  });

  String get primaryImage {
    if (images.isNotEmpty && images.first.trim().isNotEmpty) {
      return images.first;
    }
    return 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=600&q=80';
  }

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    List<String> parsedImages = [];
    final rawImages = json['images'] ?? json['image_url'];
    if (rawImages is List) {
      parsedImages = rawImages.map((e) => e.toString()).toList();
    } else if (rawImages is String && rawImages.isNotEmpty) {
      if (rawImages.startsWith('[') && rawImages.endsWith(']')) {
        // May be stringified JSON array
        try {
          final clean = rawImages.replaceAll('[', '').replaceAll(']', '').replaceAll('"', '');
          parsedImages = clean.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
        } catch (_) {
          parsedImages = [rawImages];
        }
      } else {
        parsedImages = [rawImages];
      }
    }

    List<String> parsedTags = [];
    final rawTags = json['tags'];
    if (rawTags is List) {
      parsedTags = rawTags.map((e) => e.toString()).toList();
    }

    return ProductModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Artisan Craft',
      description: json['description']?.toString() ?? '',
      price: (json['price'] is num) ? (json['price'] as num).toDouble() : double.tryParse(json['price']?.toString() ?? '0') ?? 0.0,
      stock: (json['stock'] is num) ? (json['stock'] as num).toInt() : int.tryParse(json['stock']?.toString() ?? '0') ?? 0,
      category: json['category']?.toString() ?? 'Crafts',
      images: parsedImages,
      artisanId: json['artisan_id']?.toString() ?? json['artisan']?['id']?.toString(),
      artisanName: json['artisan_name']?.toString() ?? json['artisan']?['store_name']?.toString() ?? json['artisan']?['name']?.toString(),
      tags: parsedTags,
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at'].toString()) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'price': price,
      'stock': stock,
      'category': category,
      'images': images,
      if (artisanId != null) 'artisan_id': artisanId,
      'tags': tags,
    };
  }
}
