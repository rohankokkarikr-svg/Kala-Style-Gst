import 'package:dio/dio.dart';
import 'api_client.dart';
import '../config/api_config.dart';

class AiAnalysisResult {
  final String title;
  final String description;
  final String category;
  final double suggestedPrice;
  final List<String> tags;

  AiAnalysisResult({
    required this.title,
    required this.description,
    required this.category,
    required this.suggestedPrice,
    required this.tags,
  });

  factory AiAnalysisResult.fromJson(Map<String, dynamic> json) {
    List<String> parsedTags = [];
    if (json['tags'] is List) {
      parsedTags = (json['tags'] as List).map((e) => e.toString()).toList();
    }
    return AiAnalysisResult(
      title: json['title']?.toString() ?? json['name']?.toString() ?? 'Handcrafted Creation',
      description: json['description']?.toString() ?? '',
      category: json['category']?.toString() ?? 'Crafts',
      suggestedPrice: (json['suggestedPrice'] is num)
          ? (json['suggestedPrice'] as num).toDouble()
          : (json['price'] is num)
              ? (json['price'] as num).toDouble()
              : double.tryParse(json['suggestedPrice']?.toString() ?? json['price']?.toString() ?? '999') ?? 999.0,
      tags: parsedTags,
    );
  }
}

class AiAdminStatusModel {
  final bool active;
  final bool autonomous;
  final String mode;
  final String provider;
  final String? lastDecision;
  final List<Map<String, dynamic>> pendingApprovals;
  final List<Map<String, dynamic>> recentActions;
  final Map<String, dynamic> telemetry;

  AiAdminStatusModel({
    required this.active,
    required this.autonomous,
    required this.mode,
    required this.provider,
    this.lastDecision,
    this.pendingApprovals = const [],
    this.recentActions = const [],
    this.telemetry = const {},
  });

  factory AiAdminStatusModel.fromJson(Map<String, dynamic> json) {
    final status = json['status'] ?? json;
    final telemetryData = json['telemetry'] ?? status['telemetry'] ?? <String, dynamic>{};

    List<Map<String, dynamic>> approvals = [];
    if (json['pendingApprovals'] is List) {
      approvals = (json['pendingApprovals'] as List).map((e) => e as Map<String, dynamic>).toList();
    } else if (status['pendingApprovals'] is List) {
      approvals = (status['pendingApprovals'] as List).map((e) => e as Map<String, dynamic>).toList();
    }

    List<Map<String, dynamic>> actions = [];
    if (json['recentActions'] is List) {
      actions = (json['recentActions'] as List).map((e) => e as Map<String, dynamic>).toList();
    } else if (status['recentActions'] is List) {
      actions = (status['recentActions'] as List).map((e) => e as Map<String, dynamic>).toList();
    }

    return AiAdminStatusModel(
      active: status['active'] == true || status['enabled'] == true,
      autonomous: status['autonomous'] == true,
      mode: status['mode']?.toString() ?? 'hybrid',
      provider: status['provider']?.toString() ?? 'Google Gemini',
      lastDecision: status['lastDecision']?.toString() ?? status['lastAction']?.toString(),
      pendingApprovals: approvals,
      recentActions: actions,
      telemetry: telemetryData is Map<String, dynamic> ? telemetryData : {},
    );
  }
}

class AiService {
  final ApiClient _client = ApiClient();

  /// Product Studio: Analyze uploaded photo + artisan hints with Gemini
  Future<AiAnalysisResult> analyzeProduct({
    required String imageUrl,
    String? notes,
  }) async {
    try {
      final Map<String, dynamic> body = {'imageUrl': imageUrl};
      if (notes != null && notes.isNotEmpty) {
        body['notes'] = notes;
      }
      final response = await _client.dio.post(
        ApiConfig.aiAnalyzeProduct,
        data: body,
      );
      final data = response.data;
      final payload = data['result'] ?? data['data'] ?? data;
      return AiAnalysisResult.fromJson(payload as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'AI product analysis failed';
      throw Exception(msg);
    }
  }

  /// Product Studio: Generate description
  Future<String> generateDescription({
    required String title,
    required String category,
    String? keywords,
  }) async {
    try {
      final Map<String, dynamic> body = {
        'title': title,
        'category': category,
      };
      if (keywords != null && keywords.isNotEmpty) {
        body['keywords'] = keywords;
      }
      final response = await _client.dio.post(
        ApiConfig.aiGenerateDescription,
        data: body,
      );
      final data = response.data;
      return (data['description'] ?? data['data']?['description'] ?? data['result'] ?? '').toString();
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'AI description generation failed';
      throw Exception(msg);
    }
  }

  /// AI Admin Manager: Live telemetry & autonomous state
  Future<AiAdminStatusModel> getAiAdminStatus() async {
    try {
      final response = await _client.dio.get(ApiConfig.aiAdminStatus);
      return AiAdminStatusModel.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to fetch AI Admin status';
      throw Exception(msg);
    }
  }

  /// AI Admin Manager: Interactive chat with Gemini brain
  Future<String> chatWithAiAdmin(String message) async {
    try {
      final response = await _client.dio.post(
        ApiConfig.aiAdminChat,
        data: {'message': message},
      );
      final data = response.data;
      return (data['reply'] ?? data['response'] ?? data['message'] ?? 'Action evaluated.').toString();
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'AI Admin chat failed';
      throw Exception(msg);
    }
  }

  /// AI Admin Manager: Autonomy mode toggle
  Future<void> updateAutonomy(bool autonomous) async {
    try {
      await _client.dio.post(
        ApiConfig.aiAdminUpdateAutonomy,
        data: {'autonomous': autonomous},
      );
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to update autonomy';
      throw Exception(msg);
    }
  }

  /// AI Admin Manager: Human-in-the-loop approval
  Future<void> approveAction(String actionId) async {
    try {
      await _client.dio.post(
        ApiConfig.aiAdminApproveAction,
        data: {'actionId': actionId},
      );
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to approve action';
      throw Exception(msg);
    }
  }

  /// AI Admin Manager: Human-in-the-loop rejection
  Future<void> rejectAction(String actionId, {String? reason}) async {
    try {
      final Map<String, dynamic> body = {'actionId': actionId};
      if (reason != null && reason.isNotEmpty) {
        body['reason'] = reason;
      }
      await _client.dio.post(
        ApiConfig.aiAdminRejectAction,
        data: body,
      );
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.message ?? 'Failed to reject action';
      throw Exception(msg);
    }
  }
}
