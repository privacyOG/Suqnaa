import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  const captureEnabled = bool.fromEnvironment('CAPTURE_STORE_SCREENSHOTS');
  if (!captureEnabled) {
    await testMain();
    return;
  }

  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  final file = File(fontPath);
  if (!file.existsSync()) {
    throw StateError('Store screenshot capture font is missing: $fontPath');
  }

  final bytes = await file.readAsBytes();
  final loader = FontLoader('StoreCapture')
    ..addFont(Future.value(ByteData.sublistView(Uint8List.fromList(bytes))));
  await loader.load();
  binding.platformDispatcher.systemFontFamily = 'StoreCapture';

  await testMain();
}
