import 'dart:convert';
import 'package:http/http.dart' as http;

class SuqnaaApi {
  SuqnaaApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<List<CategoryDto>> fetchCategories() async {
    final response = await _client.get(baseUrl.resolve('/v1/categories'));
    if (response.statusCode != 200) {
      throw StateError('Unable to load categories');
    }

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    final items = payload['categories'] as List<dynamic>;
    return items.map((item) => CategoryDto.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<List<ListingDto>> fetchListings() async {
    final response = await _client.get(baseUrl.resolve('/v1/listings'));
    if (response.statusCode != 200) {
      throw StateError('Unable to load listings');
    }

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    final items = payload['listings'] as List<dynamic>;
    return items.map((item) => ListingDto.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<AssistantDto> askAssistant({required String locale, required String purpose, required String message}) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/assistant'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'locale': locale, 'purpose': purpose, 'message': message}),
    );

    if (response.statusCode != 200) {
      throw StateError('Unable to contact assistant');
    }

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    return AssistantDto.fromJson(payload['assistant'] as Map<String, dynamic>);
  }
}

class CategoryDto {
  const CategoryDto({required this.id, required this.slug, required this.nameEn, this.nameAr});

  final String id;
  final String slug;
  final String nameEn;
  final String? nameAr;

  factory CategoryDto.fromJson(Map<String, dynamic> json) {
    return CategoryDto(
      id: json['id'] as String,
      slug: json['slug'] as String,
      nameEn: json['name_en'] as String,
      nameAr: json['name_ar'] as String?,
    );
  }
}

class ListingDto {
  const ListingDto({required this.id, required this.title, required this.priceAmount, required this.currencyCode});

  final String id;
  final String title;
  final String priceAmount;
  final String currencyCode;

  factory ListingDto.fromJson(Map<String, dynamic> json) {
    return ListingDto(
      id: json['id'] as String,
      title: json['title'] as String,
      priceAmount: json['price_amount'] as String,
      currencyCode: json['currency_code'] as String,
    );
  }
}

class AssistantDto {
  const AssistantDto({required this.enabled, required this.locale, required this.purpose, required this.answer});

  final bool enabled;
  final String locale;
  final String purpose;
  final String answer;

  factory AssistantDto.fromJson(Map<String, dynamic> json) {
    return AssistantDto(
      enabled: json['enabled'] as bool,
      locale: json['locale'] as String,
      purpose: json['purpose'] as String,
      answer: json['answer'] as String,
    );
  }
}
