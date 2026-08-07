import 'package:url_launcher/url_launcher.dart';

final _resourceIdPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);

abstract interface class SecureWebHandoffGateway {
  Future<bool> openOrders({required String locale});

  Future<bool> openOrder({
    required String locale,
    required String orderId,
  });
}

abstract interface class SecureListingMediaWebHandoffGateway {
  Future<bool> openListingMediaManager({required String locale});
}

abstract interface class SecureListingEditWebHandoffGateway {
  Future<bool> openListingEdit({
    required String locale,
    required String listingId,
  });
}

abstract interface class SecureAccountRecoveryWebHandoffGateway {
  Future<bool> openPasswordRecovery({required String locale});
}

abstract interface class SecureAccountProfileWebHandoffGateway {
  Future<bool> openAccountProfile({required String locale});
}

abstract interface class SecureSellerVerificationWebHandoffGateway {
  Future<bool> openSellerVerification({required String locale});
}

extension SecureListingMediaHandoff on SecureWebHandoffGateway {
  Future<bool> openListingMediaManager({required String locale}) {
    if (this is SecureListingMediaWebHandoffGateway) {
      return (this as SecureListingMediaWebHandoffGateway)
          .openListingMediaManager(locale: locale);
    }
    return Future<bool>.value(false);
  }
}

extension SecureListingEditHandoff on SecureWebHandoffGateway {
  Future<bool> openListingEdit({
    required String locale,
    required String listingId,
  }) {
    if (this is SecureListingEditWebHandoffGateway) {
      return (this as SecureListingEditWebHandoffGateway).openListingEdit(
        locale: locale,
        listingId: listingId,
      );
    }
    return Future<bool>.value(false);
  }
}

extension SecureAccountRecoveryHandoff on SecureWebHandoffGateway {
  Future<bool> openPasswordRecovery({required String locale}) {
    if (this is SecureAccountRecoveryWebHandoffGateway) {
      return (this as SecureAccountRecoveryWebHandoffGateway)
          .openPasswordRecovery(locale: locale);
    }
    return Future<bool>.value(false);
  }
}

extension SecureAccountProfileHandoff on SecureWebHandoffGateway {
  Future<bool> openAccountProfile({required String locale}) {
    if (this is SecureAccountProfileWebHandoffGateway) {
      return (this as SecureAccountProfileWebHandoffGateway)
          .openAccountProfile(locale: locale);
    }
    return Future<bool>.value(false);
  }
}

extension SecureSellerVerificationHandoff on SecureWebHandoffGateway {
  Future<bool> openSellerVerification({required String locale}) {
    if (this is SecureSellerVerificationWebHandoffGateway) {
      return (this as SecureSellerVerificationWebHandoffGateway)
          .openSellerVerification(locale: locale);
    }
    return Future<bool>.value(false);
  }
}

typedef ExternalUrlLauncher = Future<bool> Function(Uri uri);

class BrowserSecureWebHandoff
    implements
        SecureWebHandoffGateway,
        SecureListingMediaWebHandoffGateway,
        SecureListingEditWebHandoffGateway,
        SecureAccountRecoveryWebHandoffGateway,
        SecureAccountProfileWebHandoffGateway,
        SecureSellerVerificationWebHandoffGateway {
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

  @override
  Future<bool> openListingMediaManager({required String locale}) {
    return _launcher(buildSecureListingMediaManagerUri(_webBaseUrl, locale));
  }

  @override
  Future<bool> openListingEdit({
    required String locale,
    required String listingId,
  }) {
    return _launcher(buildSecureListingEditUri(_webBaseUrl, locale, listingId));
  }

  @override
  Future<bool> openPasswordRecovery({required String locale}) {
    return _launcher(buildSecurePasswordRecoveryUri(_webBaseUrl, locale));
  }

  @override
  Future<bool> openAccountProfile({required String locale}) {
    return _launcher(buildSecureAccountProfileUri(_webBaseUrl, locale));
  }

  @override
  Future<bool> openSellerVerification({required String locale}) {
    return _launcher(buildSecureSellerVerificationUri(_webBaseUrl, locale));
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
  final normalizedOrderId = _validateResourceId(orderId, 'orderId');
  return buildSecureOrdersUri(webBaseUrl, locale).replace(
    pathSegments: [
      ...buildSecureOrdersUri(webBaseUrl, locale).pathSegments,
      normalizedOrderId,
    ],
  );
}

Uri buildSecureListingMediaManagerUri(Uri webBaseUrl, String locale) {
  final base = _validateBaseUrl(webBaseUrl);
  final normalizedLocale = _validateLocale(locale);
  return base.replace(
    pathSegments: [
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      normalizedLocale,
      'sell',
      'media',
    ],
    query: null,
    fragment: null,
  );
}

Uri buildSecureListingEditUri(
  Uri webBaseUrl,
  String locale,
  String listingId,
) {
  final base = _validateBaseUrl(webBaseUrl);
  final normalizedLocale = _validateLocale(locale);
  final normalizedListingId = _validateResourceId(listingId, 'listingId');
  return base.replace(
    pathSegments: [
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      normalizedLocale,
      'sell',
      'manage',
      normalizedListingId,
      'edit',
    ],
    query: null,
    fragment: null,
  );
}

Uri buildSecurePasswordRecoveryUri(Uri webBaseUrl, String locale) {
  final base = _validateBaseUrl(webBaseUrl);
  final normalizedLocale = _validateLocale(locale);
  return base.replace(
    pathSegments: [
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      normalizedLocale,
      'account',
      'forgot-password',
    ],
    query: null,
    fragment: null,
  );
}

Uri buildSecureAccountProfileUri(Uri webBaseUrl, String locale) {
  final base = _validateBaseUrl(webBaseUrl);
  final normalizedLocale = _validateLocale(locale);
  return base.replace(
    pathSegments: [
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      normalizedLocale,
      'account',
      'profile',
    ],
    query: null,
    fragment: null,
  );
}

Uri buildSecureSellerVerificationUri(Uri webBaseUrl, String locale) {
  final base = _validateBaseUrl(webBaseUrl);
  final normalizedLocale = _validateLocale(locale);
  return base.replace(
    pathSegments: [
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      normalizedLocale,
      'account',
      'seller-verification',
    ],
    query: null,
    fragment: null,
  );
}

String _validateResourceId(String value, String name) {
  final normalized = value.trim();
  if (!_resourceIdPattern.hasMatch(normalized)) {
    throw ArgumentError.value(value, name, 'Must be a UUID');
  }
  return normalized;
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
