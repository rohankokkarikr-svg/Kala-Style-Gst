import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import 'api_client.dart';
import '../config/api_config.dart';

class AuthService {
  final ApiClient _client = ApiClient();

  Future<UserModel> login(String email, String password) async {
    try {
      final response = await _client.dio.post(
        ApiConfig.authLogin,
        data: {
          'email': email.trim().toLowerCase(),
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
    required String email,
    required String password,
    required String role,
    String? phone,
  }) async {
    try {
      final response = await _client.dio.post(
        ApiConfig.authRegister,
        data: {
          'full_name': fullName.trim(),
          'email': email.trim().toLowerCase(),
          'password': password,
          'role': role,
          if (phone != null && phone.isNotEmpty) 'phone': phone.trim(),
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
