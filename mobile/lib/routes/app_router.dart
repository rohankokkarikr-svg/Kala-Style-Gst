import 'package:go_router/go_router.dart';
import '../screens/auth/splash_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/customer/customer_home_screen.dart';
import '../screens/customer/product_detail_screen.dart';
import '../screens/customer/cart_screen.dart';
import '../screens/customer/checkout_screen.dart';
import '../screens/customer/order_tracking_screen.dart';
import '../screens/artisan/artisan_dashboard_screen.dart';
import '../screens/artisan/artisan_orders_screen.dart';
import '../screens/artisan/add_product_camera_screen.dart';
import '../screens/artisan/ai_studio_screen.dart';
import '../screens/admin/ai_admin_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const SplashScreen(),
    ),
    GoRoute(
      path: '/home',
      builder: (context, state) => const CustomerHomeScreen(),
    ),
    GoRoute(
      path: '/product/:id',
      builder: (context, state) {
        final id = state.pathParameters['id'] ?? '';
        return ProductDetailScreen(productId: id);
      },
    ),
    GoRoute(
      path: '/cart',
      builder: (context, state) => const CartScreen(),
    ),
    GoRoute(
      path: '/checkout',
      builder: (context, state) => const CheckoutScreen(),
    ),
    GoRoute(
      path: '/orders/track',
      builder: (context, state) {
        final orderId = state.uri.queryParameters['orderId'];
        return OrderTrackingScreen(initialOrderId: orderId);
      },
    ),
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/register',
      builder: (context, state) => const RegisterScreen(),
    ),
    GoRoute(
      path: '/artisan',
      builder: (context, state) => const ArtisanDashboardScreen(),
      routes: [
        GoRoute(
          path: 'orders',
          builder: (context, state) => const ArtisanOrdersScreen(),
        ),
        GoRoute(
          path: 'add-product',
          builder: (context, state) => const AddProductCameraScreen(),
        ),
        GoRoute(
          path: 'ai-studio',
          builder: (context, state) {
            final data = state.extra as Map<String, dynamic>? ?? {};
            return AiStudioScreen(initialData: data);
          },
        ),
      ],
    ),
    GoRoute(
      path: '/admin',
      builder: (context, state) => const AiAdminScreen(),
    ),
  ],
);
