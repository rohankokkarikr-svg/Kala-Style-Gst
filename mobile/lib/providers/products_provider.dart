import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/product.dart';
import '../services/product_service.dart';

final productServiceProvider = Provider<ProductService>((ref) => ProductService());

final selectedCategoryProvider = StateProvider<String>((ref) => 'All');
final searchQueryProvider = StateProvider<String>((ref) => '');

final productsProvider = FutureProvider.autoDispose<List<ProductModel>>((ref) async {
  final service = ref.watch(productServiceProvider);
  final category = ref.watch(selectedCategoryProvider);
  final search = ref.watch(searchQueryProvider);

  return await service.getProducts(
    category: category == 'All' ? null : category,
    search: search.isEmpty ? null : search,
  );
});

final productDetailProvider = FutureProvider.family<ProductModel, String>((ref, id) async {
  final service = ref.watch(productServiceProvider);
  return await service.getProductById(id);
});
