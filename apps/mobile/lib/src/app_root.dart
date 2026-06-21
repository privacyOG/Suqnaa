import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'features/home/home_screen.dart';
import 'session/app_session.dart';
import 'session/session_scope.dart';

class SuqnaaRoot extends StatefulWidget {
  const SuqnaaRoot({super.key});

  @override
  State<SuqnaaRoot> createState() => _SuqnaaRootState();
}

class _SuqnaaRootState extends State<SuqnaaRoot> {
  final AppSession _session = AppSession();

  @override
  void dispose() {
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
        ),
        home: const HomeScreen(),
      ),
    );
  }
}
