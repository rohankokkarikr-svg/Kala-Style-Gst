class OrderItemModel {
  final String productId;
  final String title;
  final int quantity;
  final double price;
  final String? image;

  OrderItemModel({
    required this.productId,
    required this.title,
    required this.quantity,
    required this.price,
    this.image,
  });

  factory OrderItemModel.fromJson(Map<String, dynamic> json) {
    return OrderItemModel(
      productId: json['product_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? json['name']?.toString() ?? json['product']?['name']?.toString() ?? 'Artisan Item',
      quantity: (json['quantity'] is num) ? (json['quantity'] as num).toInt() : 1,
      price: (json['price'] is num)
          ? (json['price'] as num).toDouble()
          : (json['price_at_time'] is num)
              ? (json['price_at_time'] as num).toDouble()
              : double.tryParse(json['price']?.toString() ?? json['price_at_time']?.toString() ?? '0') ?? 0.0,
      image: json['image']?.toString() ?? json['image_url']?.toString() ?? json['product']?['image_url']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'product_id': productId,
      'title': title,
      'quantity': quantity,
      'price': price,
      if (image != null) 'image': image,
    };
  }
}

class OrderModel {
  final String id;
  final String? orderNumber;
  final String? customerName;
  final String? customerPhone;
  final String? shippingAddress;
  final double totalAmount;
  final String paymentStatus; // 'pending', 'paid', 'failed'
  final String orderStatus; // 'placed', 'confirmed', 'shipped', 'delivered', 'cancelled'
  final String? trackingNumber;
  final DateTime? createdAt;
  final List<OrderItemModel> items;

  OrderModel({
    required this.id,
    this.orderNumber,
    this.customerName,
    this.customerPhone,
    this.shippingAddress,
    required this.totalAmount,
    required this.paymentStatus,
    required this.orderStatus,
    this.trackingNumber,
    this.createdAt,
    this.items = const [],
  });

  String get displayOrderNumber => orderNumber ?? (id.length > 8 ? id.substring(0, 8) : id);

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    List<OrderItemModel> itemsList = [];
    final rawItems = json['items'] ?? json['order_items'];
    if (rawItems is List) {
      for (final item in rawItems) {
        if (item is Map<String, dynamic>) {
          try {
            itemsList.add(OrderItemModel.fromJson(item));
          } catch (_) {}
        } else if (item is Map) {
          try {
            itemsList.add(OrderItemModel.fromJson(Map<String, dynamic>.from(item)));
          } catch (_) {}
        }
      }
    }

    final double resolvedTotal = (json['total_amount'] is num)
        ? (json['total_amount'] as num).toDouble()
        : (json['total_price'] is num)
            ? (json['total_price'] as num).toDouble()
            : double.tryParse(json['total_amount']?.toString() ?? json['total_price']?.toString() ?? '0') ?? 0.0;

    return OrderModel(
      id: json['id']?.toString() ?? '',
      orderNumber: json['order_number']?.toString(),
      customerName: json['customer_name']?.toString() ?? json['shipping_name']?.toString() ?? json['user']?['full_name']?.toString() ?? json['user']?['name']?.toString(),
      customerPhone: json['phone']?.toString() ?? json['customer_phone']?.toString() ?? json['user']?['phone']?.toString(),
      shippingAddress: json['shipping_address']?.toString() ?? json['address']?.toString(),
      totalAmount: resolvedTotal,
      paymentStatus: json['payment_status']?.toString() ?? 'pending',
      orderStatus: json['order_status']?.toString() ?? json['status']?.toString() ?? 'placed',
      trackingNumber: json['tracking_number']?.toString() ?? json['courier_tracking_id']?.toString(),
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at'].toString()) : null,
      items: itemsList,
    );
  }
}
