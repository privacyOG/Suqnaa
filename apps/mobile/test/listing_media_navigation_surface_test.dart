import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('account and listing creation surfaces link the photo manager', () {
    final account = File(
      'lib/src/features/account/account_screen.dart',
    ).readAsStringSync();
    final createListing = File(
      'lib/src/features/sell/create_listing_screen.dart',
    ).readAsStringSync();
    final manager = File(
      'lib/src/features/sell/listing_media_manager_screen.dart',
    ).readAsStringSync();

    expect(account, contains("import '../sell/listing_media_manager_screen.dart';"));
    expect(account, contains("Key('listing-photo-manager-account-tile')"));
    expect(account, contains('const ListingMediaManagerScreen()'));

    expect(
      createListing,
      contains("import 'listing_media_manager_screen.dart';"),
    );
    expect(
      createListing,
      contains("Key('open-listing-photo-manager-from-create')"),
    );
    expect(createListing, contains('const ListingMediaManagerScreen()'));

    expect(manager, contains("Key('pick-listing-photo')"));
    expect(manager, contains("Key('open-secure-listing-media-manager')"));
    expect(manager, contains('configuration.enabled'));
    expect(manager, contains('!selected.mediaChangesAllowed'));
    expect(manager, contains('maximumListingPhotoCount'));
    expect(manager, contains("'authorization': 'Bearer \$token'"));
  });
}
