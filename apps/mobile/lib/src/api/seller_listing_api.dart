import 'authed_api.dart';

abstract interface class SellerListingEditGateway {
  Future<Map<String, dynamic>> getForEdit(
    String accessToken, {
    required String listingId,
  });

  Future<Map<String, dynamic>> getCategories(String accessToken);

  Future<Map<String, dynamic>> updateDetails(
    String accessToken, {
    required String listingId,
    required Map<String, dynamic> input,
  });
}

abstract interface class SellerListingLocationGateway {
  Future<Map<String, dynamic>> getLocation(
    String accessToken, {
    required String listingId,
  });

  Future<Map<String, dynamic>> updateLocation(
    String accessToken, {
    required String listingId,
    required int version,
    required Map<String, double>? approximateLocation,
  });
}

abstract interface class SellerListingLifecycleGateway {
  Future<Map<String, dynamic>> getLifecycle(
    String accessToken, {
    required String listingId,
  });

  Future<Map<String, dynamic>> renewLifecycle(
    String accessToken, {
    required String listingId,
    required int version,
  });
}

class SellerListingApi implements SellerListingEditGateway, SellerListingLocationGateway, SellerListingLifecycleGateway {
  SellerListingApi({required AuthedApi authedApi}) : _authedApi = authedApi;

  final AuthedApi _authedApi;

  Future<Map<String, dynamic>> getMine(
    String accessToken, {
    String? status,
    int limit = 20,
    String? before,
  }) {
    final query = <String, String>{
      'limit': limit.toString(),
      if (status != null && status.isNotEmpty) 'status': status,
      if (before != null && before.isNotEmpty) 'before': before,
    };
    final path = Uri(
      path: '/v1/listings/mine',
      queryParameters: query,
    ).toString();

    return _authedApi.get(path, accessToken);
  }

  @override
  Future<Map<String, dynamic>> getForEdit(
    String accessToken, {
    required String listingId,
  }) {
    final encodedId = Uri.encodeComponent(listingId);
    return _authedApi.get('/v1/listings/$encodedId/manage', accessToken);
  }

  @override
  Future<Map<String, dynamic>> getLocation(
    String accessToken, {
    required String listingId,
  }) {
    final encodedId = Uri.encodeComponent(listingId);
    return _authedApi.get('/v1/listings/$encodedId/location/manage', accessToken);
  }

  @override
  Future<Map<String, dynamic>> getLifecycle(
    String accessToken, {
    required String listingId,
  }) {
    final encodedId = Uri.encodeComponent(listingId);
    return _authedApi.get('/v1/listings/$encodedId/lifecycle', accessToken);
  }

  @override
  Future<Map<String, dynamic>> getCategories(String accessToken) {
    return _authedApi.get('/v1/categories', accessToken);
  }

  @override
  Future<Map<String, dynamic>> updateDetails(
    String accessToken, {
    required String listingId,
    required Map<String, dynamic> input,
  }) {
    final encodedId = Uri.encodeComponent(listingId);
    return _authedApi.post(
      '/v1/listings/$encodedId/edit',
      accessToken,
      input,
    );
  }

  @override
  Future<Map<String, dynamic>> updateLocation(
    String accessToken, {
    required String listingId,
    required int version,
    required Map<String, double>? approximateLocation,
  }) {
    final encodedId = Uri.encodeComponent(listingId);
    return _authedApi.post(
      '/v1/listings/$encodedId/location',
      accessToken,
      {
        'version': version,
        'approximateLocation': approximateLocation,
      },
    );
  }

  @override
  Future<Map<String, dynamic>> renewLifecycle(
    String accessToken, {
    required String listingId,
    required int version,
  }) {
    final encodedId = Uri.encodeComponent(listingId);
    return _authedApi.post(
      '/v1/listings/$encodedId/renew',
      accessToken,
      {'version': version},
    );
  }

  Future<Map<String, dynamic>> updateStatus(
    String accessToken, {
    required String listingId,
    required String status,
  }) {
    final encodedId = Uri.encodeComponent(listingId);
    return _authedApi.post(
      '/v1/listings/$encodedId/status',
      accessToken,
      {'status': status},
    );
  }
}
