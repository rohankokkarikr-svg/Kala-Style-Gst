import 'package:dio/dio.dart';
import '../models/product.dart';
import 'api_client.dart';
import '../config/api_config.dart';

class ProductService {
  final ApiClient _client = ApiClient();

  Future<List<ProductModel>> getProducts({
    String? category,
    String? search,
    double? minPrice,
    double? maxPrice,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (category != null && category.isNotEmpty && category.toLowerCase() != 'all') {
        queryParams['category'] = category;
      }
      if (search != null && search.trim().isNotEmpty) {
        queryParams['search'] = search.trim();
      }
      if (minPrice != null) queryParams['min_price'] = minPrice;
      if (maxPrice != null) queryParams['max_price'] = maxPrice;

      final response = await _client.dio.get(
        ApiConfig.products,
        queryParameters: queryParams,
      );

      final dynamic rawData = response.data;
      List listData = [];
      if (rawData is List) {
        listData = rawData;
      } else if (rawData is Map && rawData['products'] is List) {
        listData = rawData['products'];
      } else if (rawData is Map && rawData['data'] is List) {
        listData = rawData['data'];
      }

      return listData
          .map((item) => ProductModel.fromJson(item as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to load products';
      throw Exception(msg);
    }
  }

  Future<ProductModel> getProductById(String id) async {
    try {
      final response = await _client.dio.get('${ApiConfig.products}/$id');
      final dynamic rawData = response.data;
      final productJson = (rawData is Map && rawData['product'] != null)
          ? rawData['product']
          : rawData;
      return ProductModel.fromJson(productJson as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Product not found';
      throw Exception(msg);
    }
  }

  Future<String> uploadImage(String filePath, String fileName) async {
    try {
      final formData = FormData.fromMap({
        'image': await MultipartFile.fromFile(filePath, filename: fileName),
      });

      final response = await _client.dio.post(
        ApiConfig.productUpload,
        data: formData,
      );

      final data = response.data;
      final url = data['imageUrl'] ?? data['url'] ?? data['data']?['url'];
      if (url == null) {
        throw Exception('Server did not return an image URL');
      }
      return url.toString();
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Image upload failed';
      throw Exception(msg);
    }
  }

  Future<ProductModel> createProduct({
    required String name,
    required String description,
    required double price,
    required int stock,
    required String category,
    required List<String> images,
    List<String> tags = const [],
  }) async {
    try {
      final response = await _client.dio.post(
        ApiConfig.products,
        data: {
          'name': name,
          'description': description,
          'price': price,
          'stock': stock,
          'category': category,
          'images': images,
          'tags': tags,
        },
      );

      final data = response.data;
      final productJson = data['product'] ?? data['data'] ?? data;
      return ProductModel.fromJson(productJson as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to create product';
      throw Exception(msg);
    }
  }
}
