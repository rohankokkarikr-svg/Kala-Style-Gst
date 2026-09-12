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
      title: json['title']?.toString() ?? json['name']?.toString() ?? 'Artisan Item',
      quantity: (json['quantity'] is num) ? (json['quantity'] as num).toInt() : 1,
      price: (json['price'] is num) ? (json['price'] as num).toDouble() : double.tryParse(json['price']?.toString() ?? '0') ?? 0.0,
      image: json['image']?.toString() ?? json['image_url']?.toString(),
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

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    List<OrderItemModel> itemsList = [];
    if (json['items'] is List) {
      itemsList = (json['items'] as List)
          .map((item) => OrderItemModel.fromJson(item as Map<String, dynamic>))
          .toList();
    } else if (json['order_items'] is List) {
      itemsList = (json['order_items'] as List)
          .map((item) => OrderItemModel.fromJson(item as Map<String, dynamic>))
          .toList();
    }

    return OrderModel(
      id: json['id']?.toString() ?? '',
      customerName: json['customer_name']?.toString() ?? json['user']?['full_name']?.toString(),
      customerPhone: json['customer_phone']?.toString() ?? json['user']?['phone']?.toString(),
      shippingAddress: json['shipping_address']?.toString() ?? json['address']?.toString(),
      totalAmount: (json['total_amount'] is num)
          ? (json['total_amount'] as num).toDouble()
          : double.tryParse(json['total_amount']?.toString() ?? '0') ?? 0.0,
      paymentStatus: json['payment_status']?.toString() ?? 'pending',
      orderStatus: json['order_status']?.toString() ?? json['status']?.toString() ?? 'placed',
      trackingNumber: json['tracking_number']?.toString(),
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at'].toString()) : null,
      items: itemsList,
    );
  }
}
