class UserModel {
  final String id;
  final String email;
  final String? fullName;
  final String role; // 'customer', 'artisan', 'admin'
  final String? phone;
  final String? token;

  UserModel({
    required this.id,
    required this.email,
    this.fullName,
    required this.role,
    this.phone,
    this.token,
  });

  bool get isAdmin => role == 'admin';
  bool get isArtisan => role == 'artisan' || role == 'admin';
  bool get isCustomer => role == 'customer';

  factory UserModel.fromJson(Map<String, dynamic> json, {String? token}) {
    return UserModel(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      fullName: json['full_name']?.toString() ?? json['name']?.toString(),
      role: (json['role']?.toString().toLowerCase() ?? 'customer'),
      phone: json['phone']?.toString(),
      token: token ?? json['token']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'full_name': fullName,
      'role': role,
      'phone': phone,
      if (token != null) 'token': token,
    };
  }

  UserModel copyWith({
    String? id,
    String? email,
    String? fullName,
    String? role,
    String? phone,
    String? token,
  }) {
    return UserModel(
      id: id ?? this.id,
      email: email ?? this.email,
      fullName: fullName ?? this.fullName,
      role: role ?? this.role,
      phone: phone ?? this.phone,
      token: token ?? this.token,
    );
  }
}
