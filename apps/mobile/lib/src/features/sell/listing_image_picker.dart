import 'package:image_picker/image_picker.dart';
import '../../api/listing_media_api.dart';

abstract interface class ListingImagePickerGateway {
  Future<PickedListingImage?> pickSingle();
}

class GalleryListingImagePicker implements ListingImagePickerGateway {
  GalleryListingImagePicker({ImagePicker? picker})
      : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<PickedListingImage?> pickSingle() async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 92,
      maxWidth: 4096,
      maxHeight: 4096,
      requestFullMetadata: false,
    );
    if (file == null) {
      return null;
    }

    final bytes = await file.readAsBytes();
    final mimeType = _resolvedMimeType(file);
    final result = PickedListingImage(
      bytes: bytes,
      mimeType: mimeType,
      fileName: file.name,
    );
    result.validate();
    return result;
  }
}

String _resolvedMimeType(XFile file) {
  final reported = file.mimeType?.trim().toLowerCase();
  if (reported == 'image/jpeg' ||
      reported == 'image/png' ||
      reported == 'image/webp') {
    return reported!;
  }

  final name = file.name.toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (name.endsWith('.png')) {
    return 'image/png';
  }
  if (name.endsWith('.webp')) {
    return 'image/webp';
  }
  throw const FormatException('Unsupported listing image type');
}
