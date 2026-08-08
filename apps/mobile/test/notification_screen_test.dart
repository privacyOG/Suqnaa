import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/notification_api.dart';
import 'package:suqnaa/src/features/notifications/notification_screen.dart';

const notificationId = '123e4567-e89b-42d3-a456-426614174000';

Widget app(Widget home) => MaterialApp(
  localizationsDelegates: const [
    AppLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ],
  supportedLocales: AppLocalizations.supportedLocales,
  home: home,
);

void main() {
  testWidgets('notification centre shows inbox and updates delivery preferences', (tester) async {
    final gateway = _FakeNotificationGateway();
    await tester.pumpWidget(app(NotificationScreen(
      gateway: gateway,
      accessToken: 'token',
    )));
    await tester.pumpAndSettle();

    expect(find.textContaining('Notification inbox'), findsOneWidget);
    expect(find.text('New offer'), findsOneWidget);
    expect(find.byKey(const Key('notification-read-all')), findsOneWidget);

    await tester.tap(find.byKey(const Key('notification-read-all')));
    await tester.pumpAndSettle();
    expect(gateway.markAllCalls, 1);

    await tester.scrollUntilVisible(
      find.byKey(const Key('notification-sms-offers')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    final sms = tester.widget<SwitchListTile>(find.byKey(const Key('notification-sms-offers')));
    expect(sms.value, isFalse);
    await tester.tap(find.byKey(const Key('notification-sms-offers')));
    await tester.pumpAndSettle();
    expect(gateway.preferenceUpdates, 1);
    expect(gateway.preferences.single.smsEnabled, isTrue);
  });
}

class _FakeNotificationGateway implements NotificationGateway {
  int markAllCalls = 0;
  int preferenceUpdates = 0;
  var notifications = [
    MarketplaceNotificationDto(
      id: notificationId,
      eventType: 'offer.received',
      eventFamily: 'offers',
      title: 'New offer',
      body: 'A buyer made an offer on your listing.',
      readAt: null,
      createdAt: DateTime.utc(2026, 8, 8),
    ),
  ];
  var preferences = const [
    NotificationPreferenceDto(
      eventFamily: 'offers',
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
    ),
  ];

  @override
  Future<NotificationInboxDto> getNotifications(String accessToken) async => NotificationInboxDto(
    notifications: notifications,
    unreadCount: notifications.where((item) => !item.read).length,
  );

  @override
  Future<List<NotificationPreferenceDto>> getPreferences(String accessToken) async => preferences;

  @override
  Future<void> markRead(String accessToken, String notificationId) async {
    notifications = notifications.map((item) => MarketplaceNotificationDto(
      id: item.id,
      eventType: item.eventType,
      eventFamily: item.eventFamily,
      title: item.title,
      body: item.body,
      readAt: item.id == notificationId ? DateTime.utc(2026, 8, 8, 1) : item.readAt,
      createdAt: item.createdAt,
    )).toList(growable: false);
  }

  @override
  Future<void> markAllRead(String accessToken) async {
    markAllCalls += 1;
    notifications = notifications.map((item) => MarketplaceNotificationDto(
      id: item.id,
      eventType: item.eventType,
      eventFamily: item.eventFamily,
      title: item.title,
      body: item.body,
      readAt: DateTime.utc(2026, 8, 8, 1),
      createdAt: item.createdAt,
    )).toList(growable: false);
  }

  @override
  Future<NotificationPreferenceDto> updatePreference(
    String accessToken,
    NotificationPreferenceDto preference,
  ) async {
    preferenceUpdates += 1;
    preferences = [preference];
    return preference;
  }
}
