import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/mobile_environment.dart';

class PublicListingApi {
  PublicListingApi({Uri? baseUrl, http.Client? client})
      : _baseUrl = baseUrl ?? Uri.parse(MobileEnvironment.apiBaseUrl),
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final http.Client _client;

  Future<Map<String, dynamic>> getListings({
    int limit = 20,
    String? before,
    String? q,
    String? condition,
    double? minPrice,
    double? maxPrice,
    String? currency,
    String? country,
    String? city,
  }) async {
    final params = <String, String>{
      'limit': limit.toString(),
      if (before != null) 'before': before,
      if (q != null && q.isNotEmpty) 'q': q,
      if (condition != null && condition.isNotEmpty) 'condition': condition,
      if (minPrice != null) 'minPrice': minPrice.toString(),
      if (maxPrice != null) 'maxPrice': maxPrice.toString(),
      if (currency != null && currency.isNotEmpty) 'currency': currency,
      if (country != null && country.isNotEmpty) 'country': country,
      if (city != null && city.isNotEmpty) 'city': city,
    };

    final uri = _baseUrl.resolve('/v1/listings').replace(queryParameters: params);
    final response = await _client.get(uri, headers: {'accept': 'application/json'});

    if (response.statusCode != 200) {
      throw StateError('Failed to load listings (${response.statusCode})');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getListing(String listingId) async {
    final uri = _baseUrl.resolve('/v1/listings/${Uri.encodeComponent(listingId)}');
    final response = await _client.get(uri, headers: {'accept': 'application/json'});

    if (response.statusCode == 404) {
      throw StateError('Listing not found');
    }
    if (response.statusCode != 200) {
      throw StateError('Failed to load listing (${response.statusCode})');
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['listing'] as Map<String, dynamic>;
  }
}
