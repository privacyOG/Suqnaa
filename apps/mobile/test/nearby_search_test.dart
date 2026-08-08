import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/catalog_api.dart';

void main() {
  test('nearby query quantizes centre and supports nearest sorting', () {
    final query = const CatalogSearchOptions(
      nearLatitude: -33.8688,
      nearLongitude: 151.2093,
      radiusKm: 25,
      sort: 'distance',
    ).toQueryParameters();

    expect(query, containsPair('nearLat', '-33.87'));
    expect(query, containsPair('nearLon', '151.21'));
    expect(query, containsPair('radiusKm', '25.0'));
    expect(query, containsPair('sort', 'distance'));
  });

  test('nearby query requires complete bounded spatial input', () {
    expect(
      () => const CatalogSearchOptions(
        nearLatitude: -33.87,
        radiusKm: 20,
      ).toQueryParameters(),
      throwsArgumentError,
    );
    expect(
      () => const CatalogSearchOptions(
        nearLatitude: -33.87,
        nearLongitude: 151.21,
        radiusKm: 501,
      ).toQueryParameters(),
      throwsArgumentError,
    );
    expect(
      () => const CatalogSearchOptions(sort: 'distance').toQueryParameters(),
      throwsArgumentError,
    );
  });

  test('catalog listing accepts coarse distance without coordinates', () {
    const listingId = '123e4567-e89b-42d3-a456-426614174000';
    final listing = CatalogListingDto.fromJson(
      {
        'id': listingId,
        'title': 'Nearby item',
        'description': 'A marketplace listing with coarse distance only.',
        'priceAmount': '40.00',
        'currencyCode': 'AUD',
        'condition': 'good',
        'availabilityStatus': 'in_stock',
        'availableQuantity': 1,
        'unitLabel': 'item',
        'countryCode': 'AU',
        'region': 'NSW',
        'city': 'Sydney',
        'suburb': 'Greenacre',
        'distanceKm': 7,
        'allowPickup': true,
        'allowDelivery': false,
        'media': const [],
        'mediaCount': 0,
        'category': null,
        'seller': null,
      },
      Uri.parse('https://api.suqnaa.test'),
    );

    expect(listing.distanceKm, 7);
  });
}
