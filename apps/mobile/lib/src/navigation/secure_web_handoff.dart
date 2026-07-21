import 'package:url_launcher/url_launcher.dart';

final _orderIdPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);

abstract interface class SecureWebHandoffGateway {
  Future<bool> openOrders({required String locale});

  Future<bool> openOrder({
    required String locale,
    required String orderId,
  });
}

typedef ExternalUrlLauncher = Future<bool> Function(Uri uri);

class BrowserSecureWebHandoff implements SecureWebHandoffGateway {
  BrowserSecureWebHandoff({
    required Uri webBaseUrl,
    ExternalUrlLauncher? launcher,
  })  : _webBaseUrl = _validateBaseUrl(webBaseUrl),
        _launcher = launcher ?? _launchExternally;

  final Uri _webBaseUrl;
  final ExternalUrlLauncher _launcher;

  @override
  Future<bool> openOrders({required String locale}) {
    return _launcher(buildSecureOrdersUri(_webBaseUrl, locale));
  }

  @override
  Future<bool> openOrder({
    required String locale,
    required String orderId,
  }) {
    return _launcher(buildSecureOrderUri(_webBaseUrl, locale, orderId));
  }
}

Uri buildSecureOrdersUri(Uri webBaseUrl, String locale) {
  final base = _validateBaseUrl(webBaseUrl);
  final normalizedLocale = _validateLocale(locale);
  return base.replace(
    pathSegments: [
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      normalizedLocale,
      'activity',
      'orders',
    ],
    query: null,
    fragment: null,
  );
}

Uri buildSecureOrderUri(Uri webBaseUrl, String locale, String orderId) {
  final normalizedOrderId = orderId.trim();
  if (!_orderIdPattern.hasMatch(normalizedOrderId)) {
    throw ArgumentError.value(orderId, 'orderId', 'Must be a UUID');
  }

  return buildSecureOrdersUri(webBaseUrl, locale).replace(
    pathSegments: [
      ...buildSecureOrdersUri(webBaseUrl, locale).pathSegments,
      normalizedOrderId,
    ],
  );
}

Uri _validateBaseUrl(Uri value) {
  final host = value.host.toLowerCase();
  final developmentHost = host == 'localhost' ||
      host == '127.0.0.1' ||
      host == '::1' ||
      host == '10.0.2.2';
  final secure = value.scheme == 'https';
  final allowedDevelopmentHttp = value.scheme == 'http' && developmentHost;

  if ((!secure && !allowedDevelopmentHttp) ||
      host.isEmpty ||
      value.userInfo.isNotEmpty ||
      value.hasQuery ||
      value.hasFragment) {
    throw ArgumentError.value(value, 'webBaseUrl', 'Must be a trusted web URL');
  }

  return value;
}

String _validateLocale(String value) {
  final locale = value.trim().toLowerCase();
  if (locale != 'en' && locale != 'ar') {
    throw ArgumentError.value(value, 'locale', 'Unsupported locale');
  }
  return locale;
}

Future<bool> _launchExternally(Uri uri) {
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
