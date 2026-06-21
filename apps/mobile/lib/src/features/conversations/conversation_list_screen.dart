import 'package:flutter/material.dart';
import '../../brand/brand.dart';

class ConversationListScreen extends StatelessWidget {
  const ConversationListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Messages'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          Text(
            'Your conversations',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w900,
              color: SuqnaaBrand.blue,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Sign in to view messages from buyers and sellers. Conversation history will load here once account access is connected.',
          ),
          SizedBox(height: 24),
          _EmptyConversationCard(),
        ],
      ),
    );
  }
}

class _EmptyConversationCard extends StatelessWidget {
  const _EmptyConversationCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(22),
        child: Column(
          children: [
            Icon(
              Icons.forum_outlined,
              size: 46,
              color: SuqnaaBrand.blue,
            ),
            SizedBox(height: 14),
            Text(
              'No conversations loaded',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 6),
            Text(
              'Messages, unread counts, and listing context will appear here.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
