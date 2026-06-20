import 'authed_api.dart';

class ListingApi {
  ListingApi({required AuthedApi authedApi}) : _authedApi = authedApi;

  final AuthedApi _authedApi;

  Future<Map<String, dynamic>> createDraft(String accessToken, Map<String, dynamic> input) {
    return _authedApi.post('/v1/listings', accessToken, input);
  }
}
