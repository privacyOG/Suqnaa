import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';
import 'package:suqnaa/src/api/listing_media_api.dart';
import 'package:suqnaa/src/features/sell/listing_image_picker.dart';
import 'package:suqnaa/src/features/sell/listing_media_manager_screen.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const mediaId = '223e4567-e89b-42d3-a456-426614174000';

SellerMediaListing testListing({int mediaCount = 0}) {
  return SellerMediaListing(
    id: listingId,
    title: 'Test phone',
    status: MobileListingStatus.draft,
    mediaCount: mediaCount,
  );
}

SellerListingMediaItem testMedia() {
  return SellerListingMediaItem(
    id: mediaId,
    uri: Uri.parse(
      'https://api.suqnaa.test/v1/listings/$listingId/media/$mediaId/mine',
    ),
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
    sizeBytes: 4,
    sortOrder: 0,
    altText: 'Test phone',
    createdAt: DateTime.parse('2026-07-21T01:00:00.000Z'),
  );
}

class FakeMediaGateway implements ListingMediaGateway {
  FakeMediaGateway({List<SellerListingMediaItem> initialMedia = const []})
      : media = List<SellerListingMediaItem>.from(initialMedia);

  final List<SellerListingMediaItem> media;
  int listingCalls = 0;
  int galleryCalls = 0;
  int uploadCalls = 0;
  int deleteCalls = 0;

  @override
  Future<List<SellerMediaListing>> fetchListings(String accessToken) async {
    expect(accessToken, 'access-token');
    listingCalls += 1;
    return [testListing(mediaCount: media.length)];
  }

  @override
  Future<SellerListingGallery> fetchGallery(
    String accessToken, {
    required String listingId,
  }) async {
    expect(accessToken, 'access-token');
    expect(listingId, TestValues.listingId);
    galleryCalls += 1;
    return SellerListingGallery(
      listing: testListing(mediaCount: media.length),
      media: List<SellerListingMediaItem>.unmodifiable(media),
    );
  }

  @override
  Future<ListingMediaMutationResult> upload(
    String accessToken, {
    required String listingId,
    required String listingTitle,
    required int sortOrder,
    required PickedListingImage image,
    String? challengeResponse,
  }) async {
    expect(accessToken, 'access-token');
    expect(listingId, TestValues.listingId);
    expect(listingTitle, 'Test phone');
    expect(sortOrder, media.length);
    expect(image.mimeType, 'image/jpeg');
    expect(challengeResponse, isNull);
    uploadCalls += 1;
    media
      ..clear()
      ..add(testMedia());
    return const ListingMediaMutationResult(
      mediaId: TestValues.mediaId,
      mediaCount: 1,
    );
  }

  @override
  Future<ListingMediaMutationResult> delete(
    String accessToken, {
    required String listingId,
    required String mediaId,
    String? challengeResponse,
  }) async {
    expect(accessToken, 'access-token');
    expect(listingId, TestValues.listingId);
    expect(mediaId, TestValues.mediaId);
    expect(challengeResponse, isNull);
    deleteCalls += 1;
    media.removeWhere((item) => item.id == mediaId);
    return ListingMediaMutationResult(mediaId: mediaId, mediaCount: 0);
  }
}

abstract final class TestValues {
  static const listingId = '123e4567-e89b-42d3-a456-426614174000';
  static const mediaId = '223e4567-e89b-42d3-a456-426614174000';
}

class FakeImagePicker implements ListingImagePickerGateway {
  int calls = 0;

  @override
  Future<PickedListingImage?> pickSingle() async {
    calls += 1;
    return PickedListingImage(
      bytes: Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]),
      mimeType: 'image/jpeg',
      fileName: 'phone.jpg',
    );
  }
}

class FakeChallengeGateway implements ChallengeConfigurationGateway {
  FakeChallengeGateway({required this.enabled});

  final bool enabled;

  @override
  Future<MobileChallengeConfiguration> fetch() async {
    return MobileChallengeConfiguration(
      enabled: enabled,
      provider: enabled ? 'turnstile' : 'none',
      siteKey: enabled ? 'site-key' : null,
      paymentCheckoutAction: 'payment_checkout_prepare',
      listingMediaUploadAction: 'listing_media_upload',
      listingMediaDeleteAction: 'listing_media_delete',
    );
  }
}

class FakeSecureWebHandoff
    implements SecureWebHandoffGateway, SecureListingMediaWebHandoffGateway {
  @override
  Future<bool> openListingMediaManager({required String locale}) async => true;

  @override
  Future<bool> openOrder({
    required String locale,
    required String orderId,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<bool> openOrders({required String locale}) async {
    throw UnimplementedError();
  }
}

Widget testApp({
  required FakeMediaGateway media,
  required FakeImagePicker picker,
  required FakeChallengeGateway challenge,
  required FakeSecureWebHandoff secureWeb,
  Locale locale = const Locale('en'),
}) {
  return MaterialApp(
    locale: locale,
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: ListingMediaManagerScreen(
      mediaGateway: media,
      imagePickerGateway: picker,
      challengeGateway: challenge,
      secureWebHandoffGateway: secureWeb,
      accessToken: 'access-token',
    ),
  );
}

Future<Finder> loadDeleteButton(
  WidgetTester tester,
  FakeMediaGateway media,
) async {
  await tester.pumpWidget(testApp(
    media: media,
    picker: FakeImagePicker(),
    challenge: FakeChallengeGateway(enabled: false),
    secureWeb: FakeSecureWebHandoff(),
  ));
  await tester.pumpAndSettle();
  final finder = find.byKey(Key('delete-listing-photo-$mediaId'));
  await tester.ensureVisible(finder);
  await tester.pump();
  return finder;
}

void main() {
  testWidgets('uploads one photo when challenges are disabled', (tester) async {
    final media = FakeMediaGateway();
    final picker = FakeImagePicker();

    await tester.pumpWidget(testApp(
      media: media,
      picker: picker,
      challenge: FakeChallengeGateway(enabled: false),
      secureWeb: FakeSecureWebHandoff(),
    ));
    await tester.pumpAndSettle();

    final pickButton = find.byKey(const Key('pick-listing-photo'));
    expect(pickButton, findsOneWidget);
    await tester.ensureVisible(pickButton);
    await tester.tap(pickButton);
    await tester.pumpAndSettle();
    expect(picker.calls, 1);
    expect(
      find.byKey(const Key('confirm-listing-photo-upload')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('confirm-listing-photo-upload')));
    await tester.pumpAndSettle();
    expect(media.uploadCalls, 1);
    expect(find.text('Photo 1'), findsOneWidget);
  });

  testWidgets('renders native deletion control when challenges are disabled', (
    tester,
  ) async {
    final deleteButton = await loadDeleteButton(
      tester,
      FakeMediaGateway(initialMedia: [testMedia()]),
    );
    expect(deleteButton, findsOneWidget);
  });

  testWidgets('opens native deletion confirmation', (tester) async {
    final deleteButton = await loadDeleteButton(
      tester,
      FakeMediaGateway(initialMedia: [testMedia()]),
    );
    await tester.tap(deleteButton);
    await tester.pumpAndSettle();
    expect(
      find.byKey(const Key('confirm-listing-photo-delete')),
      findsOneWidget,
    );
  });

  testWidgets('completes native photo deletion', (tester) async {
    final media = FakeMediaGateway(initialMedia: [testMedia()]);
    final deleteButton = await loadDeleteButton(tester, media);
    await tester.tap(deleteButton);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirm-listing-photo-delete')));
    await tester.pumpAndSettle();

    expect(media.deleteCalls, 1);
    expect(
      find.text('No photos have been added to this listing.'),
      findsOneWidget,
    );
  });

  testWidgets('renders only secure controls when challenges are enabled', (
    tester,
  ) async {
    await tester.pumpWidget(testApp(
      media: FakeMediaGateway(initialMedia: [testMedia()]),
      picker: FakeImagePicker(),
      challenge: FakeChallengeGateway(enabled: true),
      secureWeb: FakeSecureWebHandoff(),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('pick-listing-photo')), findsNothing);
    expect(find.byKey(Key('delete-listing-photo-$mediaId')), findsNothing);
    expect(
      find.byKey(const Key('open-secure-listing-media-manager')),
      findsOneWidget,
    );
    expect(
      find.textContaining('Browser security verification is required'),
      findsOneWidget,
    );
  });

  testWidgets('renders the protected manager in Arabic', (tester) async {
    await tester.pumpWidget(testApp(
      media: FakeMediaGateway(),
      picker: FakeImagePicker(),
      challenge: FakeChallengeGateway(enabled: true),
      secureWeb: FakeSecureWebHandoff(),
      locale: const Locale('ar'),
    ));
    await tester.pumpAndSettle();

    expect(find.text('إدارة صور الإعلانات'), findsOneWidget);
    expect(find.text('معرض صور البائع المحمي'), findsOneWidget);
    expect(find.text('فتح إدارة الصور الآمنة'), findsOneWidget);
  });
}
