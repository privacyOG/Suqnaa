import 'authed_api.dart';

class SellerListingApi {
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
}
