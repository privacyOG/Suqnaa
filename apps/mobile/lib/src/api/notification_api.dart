import 'authed_api.dart';

class MarketplaceNotificationDto {
  const MarketplaceNotificationDto({
    required this.id,
    required this.eventType,
    required this.eventFamily,
    required this.title,
    required this.body,
    required this.readAt,
    required this.createdAt,
  });

  final String id;
  final String eventType;
  final String eventFamily;
  final String title;
  final String body;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get read => readAt != null;

  factory MarketplaceNotificationDto.fromJson(Map<String, dynamic> json) {
    return MarketplaceNotificationDto(
      id: json['id'] as String,
      eventType: json['eventType'] as String,
      eventFamily: json['eventFamily'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      readAt: json['readAt'] == null ? null : DateTime.parse(json['readAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class NotificationPreferenceDto {
  const NotificationPreferenceDto({
    required this.eventFamily,
    required this.emailEnabled,
    required this.smsEnabled,
    required this.pushEnabled,
  });

  final String eventFamily;
  final bool emailEnabled;
  final bool smsEnabled;
  final bool pushEnabled;

  factory NotificationPreferenceDto.fromJson(Map<String, dynamic> json) {
    return NotificationPreferenceDto(
      eventFamily: json['eventFamily'] as String,
      emailEnabled: json['emailEnabled'] as bool,
      smsEnabled: json['smsEnabled'] as bool,
      pushEnabled: json['pushEnabled'] as bool,
    );
  }

  NotificationPreferenceDto copyWith({
    bool? emailEnabled,
    bool? smsEnabled,
    bool? pushEnabled,
  }) {
    return NotificationPreferenceDto(
      eventFamily: eventFamily,
      emailEnabled: emailEnabled ?? this.emailEnabled,
      smsEnabled: smsEnabled ?? this.smsEnabled,
      pushEnabled: pushEnabled ?? this.pushEnabled,
    );
  }
}

class NotificationInboxDto {
  const NotificationInboxDto({required this.notifications, required this.unreadCount});
  final List<MarketplaceNotificationDto> notifications;
  final int unreadCount;
}

abstract class NotificationGateway {
  Future<NotificationInboxDto> getNotifications(String accessToken);
  Future<List<NotificationPreferenceDto>> getPreferences(String accessToken);
  Future<void> markRead(String accessToken, String notificationId);
  Future<void> markAllRead(String accessToken);
  Future<NotificationPreferenceDto> updatePreference(
    String accessToken,
    NotificationPreferenceDto preference,
  );
}

class NotificationApi implements NotificationGateway {
  const NotificationApi({required this.authedApi});
  final AuthedApi authedApi;

  @override
  Future<NotificationInboxDto> getNotifications(String accessToken) async {
    final payload = await authedApi.get('/v1/notifications?limit=50', accessToken);
    final raw = payload['notifications'];
    if (raw is! List || payload['unreadCount'] is! num) {
      throw const FormatException('Invalid notification response');
    }
    return NotificationInboxDto(
      notifications: raw.map((item) {
        if (item is! Map) throw const FormatException('Invalid notification item');
        return MarketplaceNotificationDto.fromJson(Map<String, dynamic>.from(item));
      }).toList(growable: false),
      unreadCount: (payload['unreadCount'] as num).toInt(),
    );
  }

  @override
  Future<List<NotificationPreferenceDto>> getPreferences(String accessToken) async {
    final payload = await authedApi.get('/v1/notifications/preferences', accessToken);
    final raw = payload['preferences'];
    if (raw is! List) throw const FormatException('Invalid notification preferences');
    return raw.map((item) {
      if (item is! Map) throw const FormatException('Invalid notification preference');
      return NotificationPreferenceDto.fromJson(Map<String, dynamic>.from(item));
    }).toList(growable: false);
  }

  @override
  Future<void> markRead(String accessToken, String notificationId) async {
    await authedApi.post('/v1/notifications/$notificationId/read', accessToken, const {});
  }

  @override
  Future<void> markAllRead(String accessToken) async {
    await authedApi.post('/v1/notifications/read-all', accessToken, const {});
  }

  @override
  Future<NotificationPreferenceDto> updatePreference(
    String accessToken,
    NotificationPreferenceDto preference,
  ) async {
    final payload = await authedApi.post('/v1/notifications/preferences', accessToken, {
      'eventFamily': preference.eventFamily,
      'emailEnabled': preference.emailEnabled,
      'smsEnabled': preference.smsEnabled,
      'pushEnabled': preference.pushEnabled,
    });
    final raw = payload['preference'];
    if (raw is! Map) throw const FormatException('Invalid notification preference');
    return NotificationPreferenceDto.fromJson(Map<String, dynamic>.from(raw));
  }
}
