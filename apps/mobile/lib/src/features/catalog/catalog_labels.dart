import 'package:suqnaa/l10n/app_localizations.dart';

String catalogConditionLabel(AppLocalizations text, String value) {
  return switch (value) {
    'new' => text.conditionNew,
    'like_new' => text.conditionLikeNew,
    'fair' => text.conditionFair,
    'parts_or_repair' => text.conditionPartsRepair,
    _ => text.conditionGood,
  };
}

String catalogAvailabilityLabel(AppLocalizations text, String value) {
  return switch (value) {
    'limited' => text.availabilityLimited,
    'out_of_stock' => text.availabilityOutOfStock,
    'service_available' => text.availabilityService,
    _ => text.availabilityInStock,
  };
}
