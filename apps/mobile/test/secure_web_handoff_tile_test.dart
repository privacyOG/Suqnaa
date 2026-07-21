import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/features/account/secure_web_handoff_tile.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

class FakeSecureWebHandoff implements SecureWebHandoffGateway {
  FakeSecureWebHandoff(this.result);

  final Future<bool> Function() result;
  int calls = 0;
  String? locale;

  @override
  Future<bool> openOrders({required String locale}) {
    calls += 1;
    this.locale = locale;
    return result();
  }

  @override
  Future<bool> openOrder({
    required String locale,
    required String orderId,
  }) {
    throw UnimplementedError();
  }
}

Widget testApp(
  SecureWebHandoffGateway gateway, {
  Locale locale = const Locale('en'),
}) {
  return MaterialApp(
    locale: locale,
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(
      body: SecureWebHandoffTile(gateway: gateway),
    ),
  );
}

void main() {
  testWidgets('opens localized order history once while launch is pending', (
    tester,
  ) async {
    final completion = Completer<bool>();
    final gateway = FakeSecureWebHandoff(() => completion.future);

    await tester.pumpWidget(testApp(gateway));
    await tester.pumpAndSettle();

    expect(find.text('Secure payment website'), findsOneWidget);
    await tester.tap(find.text('Secure payment website'));
    await tester.pump();
    await tester.tap(find.text('Secure payment website'), warnIfMissed: false);
    await tester.pump();

    expect(gateway.calls, 1);
    expect(gateway.locale, 'en');
    expect(find.text('Opening secure website...'), findsOneWidget);

    completion.complete(true);
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Open your web order history for browser verification and payment preparation',
      ),
      findsOneWidget,
    );
  });

  testWidgets('shows localized launch failure feedback', (tester) async {
    final gateway = FakeSecureWebHandoff(() async => false);

    await tester.pumpWidget(
      testApp(gateway, locale: const Locale('ar')),
    );
    await tester.pumpAndSettle();

    expect(find.text('موقع الدفع الآمن'), findsOneWidget);
    await tester.tap(find.text('موقع الدفع الآمن'));
    await tester.pumpAndSettle();

    expect(gateway.calls, 1);
    expect(gateway.locale, 'ar');
    expect(find.text('تعذر فتح الموقع الآمن.'), findsOneWidget);
  });
}
