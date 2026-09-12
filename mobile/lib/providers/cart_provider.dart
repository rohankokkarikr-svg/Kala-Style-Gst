import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/product.dart';

class CartItem {
  final ProductModel product;
  int quantity;

  CartItem({required this.product, this.quantity = 1});

  double get subtotal => product.price * quantity;
}

class CartState {
  final Map<String, CartItem> items;

  const CartState({this.items = const {}});

  List<CartItem> get itemList => items.values.toList();
  int get itemCount => items.values.fold(0, (sum, item) => sum + item.quantity);
  double get totalAmount => items.values.fold(0.0, (sum, item) => sum + item.subtotal);
  bool get isEmpty => items.isEmpty;
}

class CartNotifier extends StateNotifier<CartState> {
  CartNotifier() : super(const CartState());

  void addItem(ProductModel product) {
    final current = Map<String, CartItem>.from(state.items);
    if (current.containsKey(product.id)) {
      current[product.id] = CartItem(
        product: product,
        quantity: current[product.id]!.quantity + 1,
      );
    } else {
      current[product.id] = CartItem(product: product, quantity: 1);
    }
    state = CartState(items: current);
  }

  void removeSingleItem(String productId) {
    if (!state.items.containsKey(productId)) return;
    final current = Map<String, CartItem>.from(state.items);
    if (current[productId]!.quantity > 1) {
      current[productId] = CartItem(
        product: current[productId]!.product,
        quantity: current[productId]!.quantity - 1,
      );
    } else {
      current.remove(productId);
    }
    state = CartState(items: current);
  }

  void removeItemCompletely(String productId) {
    final current = Map<String, CartItem>.from(state.items);
    current.remove(productId);
    state = CartState(items: current);
  }

  void clearCart() {
    state = const CartState(items: {});
  }
}

final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  return CartNotifier();
});
