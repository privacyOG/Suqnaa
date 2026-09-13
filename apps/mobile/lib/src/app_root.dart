import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'brand/brand.dart';
import 'features/home/home_screen.dart';
import 'session/app_session.dart';
import 'session/session_scope.dart';

class SuqnaaRoot extends StatefulWidget {
  const SuqnaaRoot({super.key});

  @override
  State<SuqnaaRoot> createState() => _SuqnaaRootState();
}

class _SuqnaaRootState extends State<SuqnaaRoot>
    with WidgetsBindingObserver {
  final AppSession _session = AppSession();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_session.restore());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_session.isSignedIn) {
        unawaited(_session.ensureFreshAccess());
      } else {
        unawaited(_session.restore());
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SessionScope(
      session: _session,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Suqnaa',
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF0B46D8),
          ),
          useMaterial3: true,
          scaffoldBackgroundColor: const Color(0xFFFFFAF0),
          materialTapTargetSize: MaterialTapTargetSize.padded,
          visualDensity: VisualDensity.standard,
          focusColor: const Color(0x337A2CFF),
        ),
        home: const _SessionGate(),
      ),
    );
  }
}

class _SessionGate extends StatelessWidget {
  const _SessionGate();

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);

    if (!session.isRestoring) {
      return const HomeScreen();
    }

    final locale = Localizations.maybeLocaleOf(context);
    final isArabic = locale?.languageCode == 'ar';
    final restoringLabel = isArabic
        ? 'جارٍ استعادة جلسة سوقنا...'
        : 'Restoring your Suqnaa session...';

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      body: Center(
        child: Semantics(
          liveRegion: true,
          label: restoringLabel,
          child: ExcludeSemantics(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.storefront_outlined,
                  size: 54,
                  color: SuqnaaBrand.blue,
                ),
                const SizedBox(height: 18),
                const CircularProgressIndicator(),
                const SizedBox(height: 14),
                Text(
                  restoringLabel,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}