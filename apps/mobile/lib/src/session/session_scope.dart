import 'package:flutter/widgets.dart';
import 'app_session.dart';

class SessionScope extends InheritedNotifier<AppSession> {
  const SessionScope({
    required AppSession session,
    required super.child,
    super.key,
  }) : super(notifier: session);

  static AppSession? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<SessionScope>()?.notifier;
  }

  static AppSession of(BuildContext context) {
    final session = maybeOf(context);
    assert(session != null, 'SessionScope is missing above this context');
    return session!;
  }
}
