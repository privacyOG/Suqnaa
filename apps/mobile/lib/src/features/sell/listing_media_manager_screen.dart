import 'dart:async';
import 'package:flutter/material.dart';
import '../../api/challenge_config_api.dart';
import '../../api/listing_media_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../navigation/secure_web_handoff.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import 'listing_image_picker.dart';

class ListingMediaManagerScreen extends StatefulWidget {
  const ListingMediaManagerScreen({
    super.key,
    this.mediaGateway,
    this.imagePickerGateway,
    this.challengeGateway,
    this.secureWebHandoffGateway,
    this.accessToken,
  });

  final ListingMediaGateway? mediaGateway;
  final ListingImagePickerGateway? imagePickerGateway;
  final ChallengeConfigurationGateway? challengeGateway;
  final SecureWebHandoffGateway? secureWebHandoffGateway;
  final String? accessToken;

  @override
  State<ListingMediaManagerScreen> createState() =>
      _ListingMediaManagerScreenState();
}

class _ListingMediaManagerScreenState
    extends State<ListingMediaManagerScreen> {
  ListingMediaGateway? _mediaGateway;
  ListingImagePickerGateway? _imagePickerGateway;
  ChallengeConfigurationGateway? _challengeGateway;
  SecureWebHandoffGateway? _secureWebHandoffGateway;
  AppSession? _session;
  MobileChallengeConfiguration? _configuration;
  List<SellerMediaListing> _listings = const [];
  SellerListingGallery? _gallery;
  String? _selectedListingId;
  String? _error;
  bool _initialized = false;
  bool _loading = false;
  bool _loadingGallery = false;
  bool _busy = false;
  bool _openingWeb = false;

  String get _accessToken =>
      widget.accessToken ?? _session?.access.value ?? '';

  bool get _isArabic =>
      Localizations.localeOf(context).languageCode == 'ar';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }
    _initialized = true;

    if (widget.mediaGateway != null &&
        widget.imagePickerGateway != null &&
        widget.challengeGateway != null &&
        widget.secureWebHandoffGateway != null) {
      _mediaGateway = widget.mediaGateway;
      _imagePickerGateway = widget.imagePickerGateway;
      _challengeGateway = widget.challengeGateway;
      _secureWebHandoffGateway = widget.secureWebHandoffGateway;
    } else {
      final session = SessionScope.of(context);
      final apiBaseUrl = Uri.parse(MobileEnvironment.apiBaseUrl);
      final authedApi = SessionAuthedApi(
        baseUrl: apiBaseUrl,
        sessionProvider: () => session,
      );
      _session = session;
      _mediaGateway = widget.mediaGateway ??
          ListingMediaApi(
            authedApi: authedApi,
            apiBaseUrl: apiBaseUrl,
          );
      _imagePickerGateway =
          widget.imagePickerGateway ?? GalleryListingImagePicker();
      _challengeGateway = widget.challengeGateway ??
          ChallengeConfigurationApi(baseUrl: apiBaseUrl);
      _secureWebHandoffGateway = widget.secureWebHandoffGateway ??
          BrowserSecureWebHandoff(
            webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl),
          );
    }

    unawaited(_reload());
  }

  Future<void> _reload() async {
    final mediaGateway = _mediaGateway;
    final challengeGateway = _challengeGateway;
    final token = _accessToken;
    if (mediaGateway == null ||
        challengeGateway == null ||
        token.isEmpty ||
        _loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await Future.wait<Object>([
        mediaGateway.fetchListings(token),
        challengeGateway.fetch(),
      ]);
      if (!mounted) {
        return;
      }
      final listings = results[0] as List<SellerMediaListing>;
      final configuration = results[1] as MobileChallengeConfiguration;
      final selected = listings.any((item) => item.id == _selectedListingId)
          ? _selectedListingId
          : listings.firstOrNull?.id;
      setState(() {
        _listings = listings;
        _configuration = configuration;
        _selectedListingId = selected;
        if (selected == null) {
          _gallery = null;
        }
      });
      if (selected != null) {
        await _loadGallery(selected);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _configuration = null;
          _error = _isArabic
              ? 'تعذر تحميل صور الإعلانات وإعدادات الأمان.'
              : 'Listing photos and security settings could not be loaded.';
        });
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadGallery(String listingId) async {
    final gateway = _mediaGateway;
    final token = _accessToken;
    if (gateway == null || token.isEmpty || _loadingGallery) {
      return;
    }

    setState(() {
      _loadingGallery = true;
      _error = null;
    });
    try {
      final gallery = await gateway.fetchGallery(
        token,
        listingId: listingId,
      );
      if (!mounted || _selectedListingId != listingId) {
        return;
      }
      setState(() => _gallery = gallery);
    } catch (_) {
      if (mounted) {
        setState(() {
          _gallery = null;
          _error = _isArabic
              ? 'تعذر تحميل معرض صور الإعلان.'
              : 'The listing photo gallery could not be loaded.';
        });
      }
    } finally {
      if (mounted) {
        setState(() => _loadingGallery = false);
      }
    }
  }

  Future<void> _openSecureWebsite() async {
    if (_openingWeb) {
      return;
    }
    final gateway = _secureWebHandoffGateway;
    if (gateway == null) {
      _showError(_isArabic
          ? 'تعذر فتح الموقع الآمن.'
          : 'The secure website could not be opened.');
      return;
    }

    setState(() {
      _openingWeb = true;
      _error = null;
    });
    var opened = false;
    try {
      opened = await gateway.openListingMediaManager(
        locale: Localizations.localeOf(context).languageCode,
      );
    } catch (_) {
      opened = false;
    } finally {
      if (mounted) {
        setState(() => _openingWeb = false);
      }
    }
    if (!opened && mounted) {
      _showError(_isArabic
          ? 'تعذر فتح الموقع الآمن.'
          : 'The secure website could not be opened.');
    }
  }

  Future<void> _pickAndUpload() async {
    final listing = _gallery?.listing;
    final configuration = _configuration;
    final picker = _imagePickerGateway;
    final gateway = _mediaGateway;
    final token = _accessToken;
    if (listing == null ||
        configuration == null ||
        configuration.enabled ||
        picker == null ||
        gateway == null ||
        token.isEmpty ||
        _busy ||
        !listing.mediaChangesAllowed ||
        (_gallery?.media.length ?? maximumListingPhotoCount) >=
            maximumListingPhotoCount) {
      return;
    }

    PickedListingImage? image;
    try {
      image = await picker.pickSingle();
    } catch (_) {
      if (mounted) {
        _showError(_isArabic
            ? 'استخدم صورة JPG أو PNG أو WebP بحجم لا يتجاوز 4 ميجابايت.'
            : 'Use a JPG, PNG, or WebP image no larger than 4 MB.');
      }
      return;
    }
    if (image == null || !mounted) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_isArabic ? 'رفع الصورة؟' : 'Upload this photo?'),
        content: Text(
          _isArabic
              ? 'ستُضاف الصورة إلى نهاية معرض الإعلان.'
              : 'The photo will be added to the end of the listing gallery.',
        ),
        actions: [
          TextButton(
            key: const Key('cancel-listing-photo-upload'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(_isArabic ? 'إلغاء' : 'Cancel'),
          ),
          FilledButton(
            key: const Key('confirm-listing-photo-upload'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(_isArabic ? 'رفع الصورة' : 'Upload photo'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await gateway.upload(
        token,
        listingId: listing.id,
        listingTitle: listing.title,
        sortOrder: _gallery?.media.length ?? 0,
        image: image,
      );
      if (!mounted || result.mediaCount < 1) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_isArabic
              ? 'تمت إضافة الصورة إلى الإعلان.'
              : 'The photo was added to the listing.'),
        ),
      );
      await _loadGallery(listing.id);
    } on SessionRequestException catch (caught) {
      if (mounted) {
        _showError(caught.statusCode == 409
            ? (_isArabic
                ? 'تغيّرت حالة الإعلان أو وصل إلى الحد الأقصى للصور.'
                : 'The listing changed or reached its photo limit.')
            : (_isArabic
                ? 'تعذر رفع الصورة.'
                : 'The photo could not be uploaded.'));
      }
    } catch (_) {
      if (mounted) {
        _showError(_isArabic
            ? 'تعذر رفع الصورة.'
            : 'The photo could not be uploaded.');
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _deletePhoto(SellerListingMediaItem media) async {
    final listing = _gallery?.listing;
    final configuration = _configuration;
    final gateway = _mediaGateway;
    final token = _accessToken;
    if (listing == null ||
        configuration == null ||
        configuration.enabled ||
        gateway == null ||
        token.isEmpty ||
        _busy ||
        !listing.mediaChangesAllowed) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_isArabic ? 'حذف الصورة؟' : 'Delete this photo?'),
        content: Text(
          _isArabic
              ? 'سيتم حذف الصورة نهائياً من التخزين وسجل الإعلان.'
              : 'The photo will be permanently removed from storage and the listing record.',
        ),
        actions: [
          TextButton(
            key: const Key('cancel-listing-photo-delete'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(_isArabic ? 'إلغاء' : 'Cancel'),
          ),
          FilledButton(
            key: const Key('confirm-listing-photo-delete'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(_isArabic ? 'حذف الصورة' : 'Delete photo'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await gateway.delete(
        token,
        listingId: listing.id,
        mediaId: media.id,
      );
      if (!mounted || result.mediaId != media.id) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_isArabic
              ? 'تم حذف الصورة من الإعلان.'
              : 'The photo was removed from the listing.'),
        ),
      );
      await _loadGallery(listing.id);
    } on SessionRequestException catch (caught) {
      if (mounted) {
        _showError(caught.statusCode == 409
            ? (_isArabic
                ? 'لا يمكن تغيير صور هذا الإعلان.'
                : 'Photos cannot be changed on this listing.')
            : (_isArabic
                ? 'تعذر حذف الصورة.'
                : 'The photo could not be deleted.'));
      }
    } catch (_) {
      if (mounted) {
        _showError(_isArabic
            ? 'تعذر حذف الصورة.'
            : 'The photo could not be deleted.');
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  void _showError(String message) {
    setState(() => _error = message);
  }

  String _statusLabel(MobileListingStatus status) {
    switch (status) {
      case MobileListingStatus.draft:
        return _isArabic ? 'مسودة' : 'Draft';
      case MobileListingStatus.active:
        return _isArabic ? 'منشور' : 'Active';
      case MobileListingStatus.reserved:
        return _isArabic ? 'محجوز' : 'Reserved';
      case MobileListingStatus.sold:
        return _isArabic ? 'تم البيع' : 'Sold';
      case MobileListingStatus.expired:
        return _isArabic ? 'منتهي' : 'Expired';
      case MobileListingStatus.removed:
        return _isArabic ? 'محذوف' : 'Removed';
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _gallery?.listing;
    final challengeEnabled = _configuration?.enabled == true;
    final token = _accessToken;
    final media = _gallery?.media ?? const <SellerListingMediaItem>[];
    final remaining = maximumListingPhotoCount - media.length;

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        title: Text(_isArabic ? 'إدارة صور الإعلانات' : 'Manage listing photos'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _loading && _listings.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
                children: [
                  Text(
                    _isArabic
                        ? 'معرض صور البائع المحمي'
                        : 'Protected seller photo galleries',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      color: SuqnaaBrand.blue,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _isArabic
                        ? 'اعرض صور المسودات والإعلانات المنشورة. لن يتجاوز التطبيق التحقق الأمني عبر المتصفح.'
                        : 'Preview draft and published photos. The app will never bypass browser security verification.',
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    MaterialBanner(
                      content: Text(_error!),
                      actions: [
                        TextButton(
                          onPressed: _reload,
                          child: Text(_isArabic ? 'إعادة المحاولة' : 'Retry'),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 18),
                  if (_listings.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: Text(
                        _isArabic
                            ? 'لا توجد إعلانات لإدارة صورها.'
                            : 'There are no listings with photos to manage.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    )
                  else ...[
                    DropdownButtonFormField<String>(
                      value: _selectedListingId,
                      decoration: InputDecoration(
                        labelText: _isArabic ? 'الإعلان' : 'Listing',
                        border: const OutlineInputBorder(),
                      ),
                      items: _listings.map((listing) => DropdownMenuItem(
                        value: listing.id,
                        child: Text(
                          '${listing.title} · ${_statusLabel(listing.status)}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      )).toList(growable: false),
                      onChanged: _busy
                          ? null
                          : (value) {
                              if (value == null || value == _selectedListingId) {
                                return;
                              }
                              setState(() {
                                _selectedListingId = value;
                                _gallery = null;
                              });
                              unawaited(_loadGallery(value));
                            },
                    ),
                    const SizedBox(height: 16),
                    if (_loadingGallery)
                      const Center(child: CircularProgressIndicator())
                    else if (selected != null) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                selected.title,
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '${_statusLabel(selected.status)} · ${media.length}/$maximumListingPhotoCount',
                              ),
                              if (!selected.mediaChangesAllowed) ...[
                                const SizedBox(height: 10),
                                Text(
                                  _isArabic
                                      ? 'لا يمكن تغيير صور إعلان مباع أو محذوف.'
                                      : 'Photos cannot be changed on a sold or removed listing.',
                                  style: const TextStyle(
                                    color: Colors.red,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                              if (challengeEnabled) ...[
                                const SizedBox(height: 10),
                                Text(
                                  _isArabic
                                      ? 'التحقق الأمني عبر المتصفح مطلوب. استخدم الموقع الآمن لرفع الصور أو حذفها؛ لن يتجاوز التطبيق الفحص.'
                                      : 'Browser security verification is required. Use the secure website to upload or delete photos; the app will not bypass the check.',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                OutlinedButton.icon(
                                  key: const Key('open-secure-listing-media-manager'),
                                  onPressed: _openingWeb
                                      ? null
                                      : _openSecureWebsite,
                                  icon: _openingWeb
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(Icons.open_in_browser),
                                  label: Text(_openingWeb
                                      ? (_isArabic
                                          ? 'جارٍ فتح الموقع…'
                                          : 'Opening website…')
                                      : (_isArabic
                                          ? 'فتح إدارة الصور الآمنة'
                                          : 'Open secure photo manager')),
                                ),
                              ] else ...[
                                const SizedBox(height: 12),
                                FilledButton.icon(
                                  key: const Key('pick-listing-photo'),
                                  onPressed: _busy ||
                                          !selected.mediaChangesAllowed ||
                                          remaining <= 0 ||
                                          _configuration == null
                                      ? null
                                      : _pickAndUpload,
                                  icon: const Icon(Icons.add_photo_alternate_outlined),
                                  label: Text(_isArabic
                                      ? 'إضافة صورة واحدة'
                                      : 'Add one photo'),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _isArabic
                                      ? 'المتبقي $remaining. JPG أو PNG أو WebP، بحد أقصى 4 ميجابايت.'
                                      : '$remaining slot${remaining == 1 ? '' : 's'} remaining. JPG, PNG, or WebP, maximum 4 MB.',
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (media.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 36),
                          child: Text(
                            _isArabic
                                ? 'لم تُضف صور إلى هذا الإعلان بعد.'
                                : 'No photos have been added to this listing.',
                            textAlign: TextAlign.center,
                          ),
                        )
                      else
                        GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12,
                            childAspectRatio: 0.78,
                          ),
                          itemCount: media.length,
                          itemBuilder: (context, index) {
                            final item = media[index];
                            return Card(
                              clipBehavior: Clip.antiAlias,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Expanded(
                                    child: Image.network(
                                      item.uri.toString(),
                                      headers: {
                                        'authorization': 'Bearer $token',
                                      },
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => const Center(
                                        child: Icon(Icons.broken_image_outlined),
                                      ),
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.all(8),
                                    child: Text(
                                      _isArabic
                                          ? 'الصورة ${index + 1}'
                                          : 'Photo ${index + 1}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  if (!challengeEnabled)
                                    TextButton.icon(
                                      key: Key('delete-listing-photo-${item.id}'),
                                      onPressed: _busy ||
                                              !selected.mediaChangesAllowed
                                          ? null
                                          : () => _deletePhoto(item),
                                      icon: const Icon(Icons.delete_outline),
                                      label: Text(
                                        _isArabic ? 'حذف' : 'Delete',
                                      ),
                                    ),
                                ],
                              ),
                            );
                          },
                        ),
                    ],
                  ],
                ],
              ),
            ),
    );
  }
}

extension<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
