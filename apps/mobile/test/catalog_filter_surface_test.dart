import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile catalogue preserves complete filter and cursor state', () {
    final api = File('lib/src/api/catalog_api.dart').readAsStringSync();
    final filters = File(
      'lib/src/features/catalog/catalog_filter_sheet.dart',
    ).readAsStringSync();
    final home = File('lib/src/features/home/home_screen.dart').readAsStringSync();

    expect(api, contains("this.region"));
    expect(api, contains("this.suburb"));
    expect(api, contains("this.sort = 'newest'"));
    expect(api, contains("'both'"));
    expect(api, contains("add('region', region)"));
    expect(api, contains("add('suburb', suburb)"));
    expect(api, contains("add('sort', sort)"));
    expect(api, contains('Required for price filters and sorting'));
    expect(api, contains('Invalid listing pagination response'));
    expect(api, contains("rawUrl != expectedPath"));

    expect(filters, contains("'price_asc'"));
    expect(filters, contains("'price_desc'"));
    expect(filters, contains("'both'"));
    expect(filters, contains('_regionController'));
    expect(filters, contains('_suburbController'));
    expect(filters, contains('Enter a 3-letter currency'));

    expect(home, contains('_options.copyWith('));
    expect(home, contains('clearBefore: true'));
    expect(home, contains('_options.region != null'));
    expect(home, contains('_options.suburb != null'));
    expect(home, contains("_options.sort != 'newest'"));
    expect(home, contains('existingIds.add(listing.id)'));
  });
}
