import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/catalog_api.dart';
import 'package:suqnaa/src/features/catalog/catalog_filter_sheet.dart';

Widget testApp({Locale locale = const Locale('en')}) {
  return MaterialApp(
    locale: locale,
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: const Scaffold(
      body: CatalogFilterSheet(
        initial: CatalogSearchOptions(
          limit: 20,
          country: 'AU',
          region: 'NSW',
          city: 'Sydney',
          suburb: 'Greenacre',
          fulfilment: 'both',
          sort: 'price_asc',
          currency: 'AUD',
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('renders complete English catalogue filters', (tester) async {
    await tester.pumpWidget(testApp());
    await tester.pumpAndSettle();

    expect(find.text('Sort'), findsOneWidget);
    expect(find.text('Price: low to high'), findsOneWidget);
    expect(find.text('Pickup and delivery'), findsOneWidget);
    expect(find.text('State or region'), findsOneWidget);
    expect(find.text('Suburb'), findsOneWidget);
    final values = tester
        .widgetList<TextField>(find.byType(TextField))
        .map((field) => field.controller?.text)
        .whereType<String>()
        .toSet();
    expect(values, containsAll(<String>{'AUD', 'AU', 'NSW', 'Sydney', 'Greenacre'}));
  });

  testWidgets('renders complete Arabic catalogue filters', (tester) async {
    await tester.pumpWidget(testApp(locale: const Locale('ar')));
    await tester.pumpAndSettle();

    expect(find.text('الترتيب'), findsOneWidget);
    expect(find.text('السعر: من الأقل إلى الأعلى'), findsOneWidget);
    expect(find.text('الاستلام والتوصيل معاً'), findsOneWidget);
    expect(find.text('الولاية أو المنطقة'), findsOneWidget);
    expect(find.text('الحي'), findsOneWidget);
  });

  testWidgets('requires currency for price sorting', (tester) async {
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: const Scaffold(
        body: CatalogFilterSheet(
          initial: CatalogSearchOptions(sort: 'price_desc'),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Apply filters'));
    await tester.pumpAndSettle();

    expect(
      find.text('Enter a 3-letter currency for price filters or sorting.'),
      findsOneWidget,
    );
  });
}
