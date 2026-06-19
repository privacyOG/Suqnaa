import 'package:flutter/material.dart';
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
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B46D8)),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFFFFAF0),
      ),
      home: const HomeScreen(),
    );
  }
}
