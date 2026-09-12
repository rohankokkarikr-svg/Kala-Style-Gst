import 'package:dio/dio.dart';
import '../models/order.dart';
import 'api_client.dart';
import '../config/api_config.dart';

class OrderService {
  final ApiClient _client = ApiClient();

  Future<OrderModel> createOrder({
    required List<Map<String, dynamic>> items,
    required String shippingAddress,
    required String phone,
    String? shippingName,
    String? shippingCity,
    String? shippingState,
    String? shippingPincode,
    required String paymentMethod,
  }) async {
    try {
      final Map<String, dynamic> body = {
        'items': items,
        'phone': phone,
        'shipping_address': shippingAddress,
        'payment_method': paymentMethod,
      };
      if (shippingName != null && shippingName.isNotEmpty) body['shipping_name'] = shippingName;
      if (shippingCity != null && shippingCity.isNotEmpty) body['shipping_city'] = shippingCity;
      if (shippingState != null && shippingState.isNotEmpty) body['shipping_state'] = shippingState;
      if (shippingPincode != null && shippingPincode.isNotEmpty) body['shipping_pincode'] = shippingPincode;

      final response = await _client.dio.post(
        ApiConfig.orders,
        data: body,
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
      final response = await _client.dio.get('${ApiConfig.orders}/my');
      final rawData = response.data;
      List listData = [];
      if (rawData is List) {
        listData = rawData;
      } else if (rawData is Map && rawData['orders'] is List) {
        listData = rawData['orders'];
      }

      final List<OrderModel> orders = [];
      for (final item in listData) {
        if (item is Map<String, dynamic>) {
          try {
            orders.add(OrderModel.fromJson(item));
          } catch (_) {}
        } else if (item is Map) {
          try {
            orders.add(OrderModel.fromJson(Map<String, dynamic>.from(item)));
          } catch (_) {}
        }
      }

      return orders;
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to load orders';
      throw Exception(msg);
    }
  }

  Future<OrderModel> getOrderTracking(String orderId) async {
    try {
      // First try tracking route
      try {
        final response = await _client.dio.get('${ApiConfig.orders}/$orderId/tracking');
        final rawData = response.data;
        final orderJson = (rawData is Map && rawData['order'] != null)
            ? rawData['order']
            : rawData;
        return OrderModel.fromJson(orderJson as Map<String, dynamic>);
      } catch (_) {
        // Fallback to direct getOrderById
        final response = await _client.dio.get('${ApiConfig.orders}/$orderId');
        final rawData = response.data;
        final orderJson = (rawData is Map && rawData['order'] != null)
            ? rawData['order']
            : rawData;
        return OrderModel.fromJson(orderJson as Map<String, dynamic>);
      }
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

      final List<OrderModel> orders = [];
      for (final item in listData) {
        if (item is Map<String, dynamic>) {
          try {
            orders.add(OrderModel.fromJson(item));
          } catch (_) {}
        }
      }

      return orders;
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
