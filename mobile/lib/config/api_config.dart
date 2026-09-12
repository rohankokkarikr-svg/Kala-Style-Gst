class ApiConfig {
  /// Live Production Render Backend URL (Auto-deployed from GitHub main)
  static const String liveProductionUrl = 'https://style-heaven-backend.onrender.com/api';

  /// Default backend URL. Can be overridden via --dart-define=API_BASE_URL=...
  static const String _defaultDefinedUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static String get defaultBaseUrl {
    if (_defaultDefinedUrl.isNotEmpty) {
      return _defaultDefinedUrl;
    }
    // Default to the live cloud production backend so all devices (physical phone, emulator, tablet)
    // immediately fetch live products, auth, orders, and Gemini AI operations.
    return liveProductionUrl;
  }

  // Active base URL in memory (can also be switched to local dev if desired)
  static String activeBaseUrl = defaultBaseUrl;

  // Endpoint constants matching KalaStyle Node.js API
  static const String authLogin = '/auth/login';
  static const String authRegister = '/auth/register';
  static const String authMe = '/auth/me';
  
  static const String products = '/products';
  static const String productUpload = '/products/upload';
  
  static const String artisanStats = '/artisans/me/stats';
  static const String artisanOrders = '/artisans/orders';
  static const String artisanProducts = '/artisans/me/products';
  
  static const String orders = '/orders';
  static const String orderTracking = '/orders/track';
  
  static const String aiAnalyzeProduct = '/ai/analyze-product';
  static const String aiGenerateDescription = '/ai/generate-description';
  static const String aiSuggestPrice = '/ai/suggest-price';
  static const String aiDetectCategory = '/ai/detect-category';
  
  static const String aiAdminStatus = '/admin/ai-manager/status';
  static const String aiAdminChat = '/admin/ai-manager/chat';
  static const String aiAdminTrigger = '/admin/ai-manager/trigger';
  static const String aiAdminApproveAction = '/admin/ai-manager/approve';
  static const String aiAdminRejectAction = '/admin/ai-manager/reject';
  static const String aiAdminUpdateAutonomy = '/admin/ai-manager/autonomy';
}
