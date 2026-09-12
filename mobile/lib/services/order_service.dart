import 'package:dio/dio.dart';
import '../models/order.dart';
import 'api_client.dart';
import '../config/api_config.dart';

class OrderService {
  final ApiClient _client = ApiClient();

  Future<OrderModel> createOrder({
    required List<Map<String, dynamic>> items,
    required String shippingAddress,
    required String paymentMethod,
  }) async {
    try {
      final response = await _client.dio.post(
        ApiConfig.orders,
        data: {
          'items': items,
          'shipping_address': shippingAddress,
          'payment_method': paymentMethod,
        },
      );

      final data = response.data;
      final orderJson = data['order'] ?? data['data'] ?? data;
      return OrderModel.fromJson(orderJson as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Order creation failed';
      throw Exception(msg);
    }
  }

  Future<List<OrderModel>> getUserOrders() async {
    try {
      final response = await _client.dio.get(ApiConfig.orders);
      final rawData = response.data;
      List listData = [];
      if (rawData is List) {
        listData = rawData;
      } else if (rawData is Map && rawData['orders'] is List) {
        listData = rawData['orders'];
      }

      return listData
          .map((item) => OrderModel.fromJson(item as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to load orders';
      throw Exception(msg);
    }
  }

  Future<OrderModel> getOrderTracking(String orderId) async {
    try {
      final response = await _client.dio.get('${ApiConfig.orders}/track/$orderId');
      final rawData = response.data;
      final orderJson = (rawData is Map && rawData['order'] != null)
          ? rawData['order']
          : rawData;
      return OrderModel.fromJson(orderJson as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to track order';
      throw Exception(msg);
    }
  }

  Future<List<OrderModel>> getArtisanOrders() async {
    try {
      final response = await _client.dio.get(ApiConfig.artisanOrders);
      final rawData = response.data;
      List listData = [];
      if (rawData is List) {
        listData = rawData;
      } else if (rawData is Map && rawData['orders'] is List) {
        listData = rawData['orders'];
      }

      return listData
          .map((item) => OrderModel.fromJson(item as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to load artisan orders';
      throw Exception(msg);
    }
  }

  Future<void> updateOrderStatus(String orderId, String status) async {
    try {
      await _client.dio.patch(
        '${ApiConfig.artisanOrders}/$orderId/status',
        data: {'status': status},
      );
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to update order status';
      throw Exception(msg);
    }
  }
}
