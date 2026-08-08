import 'dart:async';
import 'package:flutter/material.dart';
import '../../api/notification_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key, this.gateway, this.accessToken});

  final NotificationGateway? gateway;
  final String? accessToken;

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  NotificationGateway? _gateway;
  AppSession? _session;
  List<MarketplaceNotificationDto> _notifications = const [];
  List<NotificationPreferenceDto> _preferences = const [];
  int _unreadCount = 0;
  bool _initialized = false;
  bool _loading = false;
  String? _error;
  String? _savingFamily;

  String get _token => widget.accessToken ?? _session?.access.value ?? '';
  bool get _ar => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    if (widget.gateway != null) {
      _gateway = widget.gateway;
    } else {
      final session = SessionScope.of(context);
      _session = session;
      _gateway = NotificationApi(
        authedApi: SessionAuthedApi(
          baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
          sessionProvider: () => session,
        ),
      );
    }
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final gateway = _gateway;
    final token = _token;
    if (gateway == null || token.isEmpty || _loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<dynamic>([
        gateway.getNotifications(token),
        gateway.getPreferences(token),
      ]);
      if (!mounted) return;
      final inbox = results[0] as NotificationInboxDto;
      setState(() {
        _notifications = inbox.notifications;
        _unreadCount = inbox.unreadCount;
        _preferences = results[1] as List<NotificationPreferenceDto>;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'load');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markRead(MarketplaceNotificationDto notification) async {
    if (notification.read) return;
    try {
      await _gateway!.markRead(_token, notification.id);
      await _reload();
    } catch (_) {
      if (mounted) setState(() => _error = 'update');
    }
  }

  Future<void> _markAllRead() async {
    try {
      await _gateway!.markAllRead(_token);
      await _reload();
    } catch (_) {
      if (mounted) setState(() => _error = 'update');
    }
  }

  Future<void> _updatePreference(NotificationPreferenceDto next) async {
    setState(() {
      _savingFamily = next.eventFamily;
      _error = null;
    });
    try {
      final saved = await _gateway!.updatePreference(_token, next);
      if (!mounted) return;
      setState(() {
        _preferences = _preferences.map((row) =>
          row.eventFamily == saved.eventFamily ? saved : row
        ).toList(growable: false);
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'preferences');
    } finally {
      if (mounted) setState(() => _savingFamily = null);
    }
  }

  String _familyLabel(String family) {
    const labels = {
      'messages': ['Messages', 'الرسائل'],
      'offers': ['Offers', 'العروض'],
      'orders': ['Orders', 'الطلبات'],
      'payments': ['Payments', 'المدفوعات'],
      'fulfilment': ['Fulfilment', 'التسليم'],
      'disputes': ['Disputes', 'النزاعات'],
      'account_security': ['Account security', 'أمان الحساب'],
    };
    final label = labels[family];
    if (label == null) return family;
    return label[_ar ? 1 : 0];
  }

  @override
  Widget build(BuildContext context) {
    final ar = _ar;
    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        backgroundColor: SuqnaaBrand.ivory,
        title: Text(ar ? 'الإشعارات' : 'Notifications'),
        actions: [
          IconButton(
            key: const Key('notification-refresh'),
            tooltip: ar ? 'تحديث' : 'Refresh',
            onPressed: _loading ? null : _reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
          children: [
            if (_loading) const LinearProgressIndicator(),
            if (_error != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(
                    ar ? 'تعذر تحديث مركز الإشعارات.' : 'Unable to update notification centre.',
                  ),
                ),
              ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            ar ? 'صندوق الإشعارات ($_unreadCount غير مقروء)' : 'Notification inbox ($_unreadCount unread)',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                          ),
                        ),
                        if (_unreadCount > 0)
                          TextButton(
                            key: const Key('notification-read-all'),
                            onPressed: _markAllRead,
                            child: Text(ar ? 'قراءة الكل' : 'Mark all read'),
                          ),
                      ],
                    ),
                    if (_notifications.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(ar ? 'لا توجد إشعارات بعد.' : 'No notifications yet.'),
                      )
                    else
                      ..._notifications.map((notification) => ListTile(
                        key: Key('marketplace-notification-${notification.id}'),
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                          notification.read ? Icons.notifications_none : Icons.notifications_active,
                          color: SuqnaaBrand.blue,
                        ),
                        title: Text(notification.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(notification.body),
                        trailing: notification.read
                            ? null
                            : TextButton(
                                onPressed: () => _markRead(notification),
                                child: Text(ar ? 'قراءة' : 'Read'),
                              ),
                      )),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      ar ? 'قنوات التوصيل' : 'Delivery channels',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      ar
                          ? 'تبقى إشعارات التطبيق متاحة دائماً. المحادثات المكتومة لا ترسل تنبيهات الرسائل بالبريد أو الإشعارات الفورية.'
                          : 'In-app notifications always remain available. Muted conversations do not send message email or push alerts.',
                    ),
                    const SizedBox(height: 10),
                    ..._preferences.map((preference) {
                      final saving = _savingFamily == preference.eventFamily;
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Divider(),
                          Text(
                            _familyLabel(preference.eventFamily),
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            title: Text(ar ? 'البريد الإلكتروني' : 'Email'),
                            value: preference.emailEnabled,
                            onChanged: saving
                                ? null
                                : (value) => _updatePreference(preference.copyWith(emailEnabled: value)),
                          ),
                          SwitchListTile.adaptive(
                            key: Key('notification-sms-${preference.eventFamily}'),
                            contentPadding: EdgeInsets.zero,
                            title: const Text('SMS'),
                            value: preference.smsEnabled,
                            onChanged: saving
                                ? null
                                : (value) => _updatePreference(preference.copyWith(smsEnabled: value)),
                          ),
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            title: Text(ar ? 'الإشعارات الفورية' : 'Push'),
                            value: preference.pushEnabled,
                            onChanged: saving
                                ? null
                                : (value) => _updatePreference(preference.copyWith(pushEnabled: value)),
                          ),
                        ],
                      );
                    }),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
