import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'src/features/home/home_screen.dart';

void main() {
  runApp(const SuqnaaApp());
}

class SuqnaaApp extends StatelessWidget {
  const SuqnaaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
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
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B46D8)),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFFFFAF0),
      ),
      home: const HomeScreen(),
    );
  }
}
