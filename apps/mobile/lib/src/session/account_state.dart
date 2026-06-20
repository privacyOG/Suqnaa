class AccountState {
  const AccountState({required this.id, this.email, this.displayName, this.status});

  final String id;
  final String? email;
  final String? displayName;
  final String? status;

  factory AccountState.fromJson(Map<String, dynamic> json) {
    return AccountState(
      id: json['id'] as String,
      email: json['email'] as String?,
      displayName: (json['displayName'] ?? json['display_name']) as String?,
      status: json['status'] as String?,
    );
  }
}
