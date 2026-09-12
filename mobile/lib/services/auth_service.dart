import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import 'api_client.dart';
import '../config/api_config.dart';

class AuthService {
  final ApiClient _client = ApiClient();

  Future<UserModel> login(String identifier, String password) async {
    try {
      final clean = identifier.trim();
      final isEmail = clean.contains('@');
      final response = await _client.dio.post(
        ApiConfig.authLogin,
        data: {
          if (isEmail) 'email': clean.toLowerCase() else 'phone': clean,
          'password': password,
        },
      );

      final data = response.data;
      final token = data['token']?.toString() ?? data['data']?['token']?.toString() ?? '';
      final userData = data['user'] ?? data['data']?['user'] ?? data;

      final user = UserModel.fromJson(userData as Map<String, dynamic>, token: token);
      await _client.saveAuthSession(token, jsonEncode(user.toJson()));
      return user;
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.response?.data?['message'] ?? e.message ?? 'Login failed';
      throw Exception(msg);
    }
  }

  Future<UserModel> register({
    required String fullName,
    required String phone,
    String? email,
    required String password,
    required String role,
  }) async {
    try {
      final cleanPhone = phone.trim().replaceAll(RegExp(r'\D'), '');
      final response = await _client.dio.post(
        ApiConfig.authRegister,
        data: {
          'name': fullName.trim(),
          'full_name': fullName.trim(),
          'phone': cleanPhone.isNotEmpty ? cleanPhone : phone.trim(),
          'password': password,
          'role': role,
          if (email != null && email.isNotEmpty) 'email': email.trim().toLowerCase(),
        },
      );

      final data = response.data;
      final token = data['token']?.toString() ?? data['data']?['token']?.toString() ?? '';
      final userData = data['user'] ?? data['data']?['user'] ?? data;

      final user = UserModel.fromJson(userData as Map<String, dynamic>, token: token);
      await _client.saveAuthSession(token, jsonEncode(user.toJson()));
      return user;
    } on DioException catch (e) {
      final msg = e.response?.data?['error'] ?? e.response?.data?['message'] ?? e.message ?? 'Registration failed';
      throw Exception(msg);
    }
  }

  Future<UserModel?> getCurrentUser() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userJson = prefs.getString(ApiClient.userKey);
      final token = prefs.getString(ApiClient.tokenKey);

      if (token == null || token.isEmpty) {
        return null;
      }

      // Try local cache first for fast app launch
      UserModel? cachedUser;
      if (userJson != null) {
        try {
          cachedUser = UserModel.fromJson(jsonDecode(userJson) as Map<String, dynamic>, token: token);
        } catch (_) {}
      }

      // Refresh from server
      try {
        final response = await _client.dio.get(ApiConfig.authMe);
        final userData = response.data['user'] ?? response.data['data']?['user'] ?? response.data;
        final freshUser = UserModel.fromJson(userData as Map<String, dynamic>, token: token);
        await prefs.setString(ApiClient.userKey, jsonEncode(freshUser.toJson()));
        return freshUser;
      } catch (_) {
        return cachedUser;
      }
    } catch (_) {
      return null;
    }
  }

  Future<void> logout() async {
    await _client.clearAuthSession();
  }
}
