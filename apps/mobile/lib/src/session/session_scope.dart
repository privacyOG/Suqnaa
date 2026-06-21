import 'package:flutter/widgets.dart';
import 'app_session.dart';

class SessionScope extends InheritedNotifier<AppSession> {
  const SessionScope({
    required AppSession session,
    required super.child,
    super.key,
  }) : super(notifier: session);

  static AppSession of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<SessionScope>();
    assert(scope != null, 'SessionScope is missing above this context');
    return scope!.notifier!;
  }
}
