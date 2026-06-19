import 'package:flutter/material.dart';

void main() {
  runApp(const SuqnaaApp());
}

class SuqnaaApp extends StatelessWidget {
  const SuqnaaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Suqnaa',
      home: Scaffold(
        body: Center(child: Text('Suqnaa')),
      ),
    );
  }
}
