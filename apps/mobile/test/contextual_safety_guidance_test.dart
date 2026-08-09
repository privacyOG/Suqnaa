import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/features/safety/contextual_safety_guidance.dart';

Widget _host(SafetyDecisionPoint point, Locale locale) {
  return MaterialApp(
    locale: locale,
    supportedLocales: const [Locale('en'), Locale('ar')],
    home: Scaffold(
      body: SingleChildScrollView(
        child: ContextualSafetyGuidance(decisionPoint: point),
      ),
    ),
  );
}

void main() {
  testWidgets('renders English and Arabic guidance for every decision point', (tester) async {
    for (final point in SafetyDecisionPoint.values) {
      await tester.pumpWidget(_host(point, const Locale('en')));
      expect(find.byKey(ValueKey('safety-guidance-${point.name}')), findsOneWidget);
      expect(find.text('Safety policy'), findsOneWidget);

      await tester.pumpWidget(_host(point, const Locale('ar')));
      expect(find.byKey(ValueKey('safety-guidance-${point.name}')), findsOneWidget);
      expect(find.text('سياسة السلامة'), findsOneWidget);
    }
  });

  test('all seven mobile decision points are mounted in transaction surfaces', () {
    final listing = File('lib/src/features/sell/edit_listing_screen.dart').readAsStringSync();
    final messaging = File('lib/src/features/conversations/session_conversation_screen.dart').readAsStringSync();
    final checkout = File('lib/src/features/orders/payment_preparation_screen.dart').readAsStringSync();
    final delivery = File('lib/src/features/orders/delivery_pickup_screen.dart').readAsStringSync();
    final dispute = File('lib/src/features/orders/dispute_screen.dart').readAsStringSync();

    expect(listing, contains('SafetyDecisionPoint.listing'));
    expect(messaging, contains('SafetyDecisionPoint.messaging'));
    expect(checkout, contains('SafetyDecisionPoint.checkout'));
    expect(checkout, contains('SafetyDecisionPoint.payment'));
    expect(delivery, contains('SafetyDecisionPoint.shipping'));
    expect(delivery, contains('SafetyDecisionPoint.pickup'));
    expect(dispute, contains('SafetyDecisionPoint.dispute'));
  });

  test('guidance links to the canonical bilingual safety policy route', () {
    final source = File('lib/src/features/safety/contextual_safety_guidance.dart').readAsStringSync();
    expect(source, contains('/policy/safety'));
    expect(source, contains('MobileEnvironment.webBaseUrl'));
    expect(source, contains('LaunchMode.externalApplication'));
  });
}
