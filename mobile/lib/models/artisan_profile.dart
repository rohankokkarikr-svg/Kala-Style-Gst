class ArtisanProfileModel {
  final String id;
  final String storeName;
  final String? bio;
  final String? craftSpecialty;
  final String? location;
  final double totalEarnings;
  final int totalOrders;
  final int activeProducts;
  final double rating;

  ArtisanProfileModel({
    required this.id,
    required this.storeName,
    this.bio,
    this.craftSpecialty,
    this.location,
    this.totalEarnings = 0.0,
    this.totalOrders = 0,
    this.activeProducts = 0,
    this.rating = 5.0,
  });

  factory ArtisanProfileModel.fromJson(Map<String, dynamic> json) {
    return ArtisanProfileModel(
      id: json['id']?.toString() ?? '',
      storeName: json['store_name']?.toString() ?? json['name']?.toString() ?? 'Artisan Atelier',
      bio: json['bio']?.toString(),
      craftSpecialty: json['craft_specialty']?.toString() ?? json['specialty']?.toString(),
      location: json['location']?.toString() ?? 'India',
      totalEarnings: (json['total_earnings'] is num)
          ? (json['total_earnings'] as num).toDouble()
          : double.tryParse(json['total_earnings']?.toString() ?? '0') ?? 0.0,
      totalOrders: (json['total_orders'] is num)
          ? (json['total_orders'] as num).toInt()
          : int.tryParse(json['total_orders']?.toString() ?? '0') ?? 0,
      activeProducts: (json['active_products'] is num)
          ? (json['active_products'] as num).toInt()
          : int.tryParse(json['active_products']?.toString() ?? '0') ?? 0,
      rating: (json['rating'] is num)
          ? (json['rating'] as num).toDouble()
          : double.tryParse(json['rating']?.toString() ?? '5.0') ?? 5.0,
    );
  }
}
