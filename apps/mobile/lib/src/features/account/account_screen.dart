import 'package:flutter/material.dart';
import '../../brand/brand.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Account'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Your Suqnaa account',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
          ),
          const SizedBox(height: 8),
          const Text('Sign in and profile tools will appear here as the account layer is connected.'),
          const SizedBox(height: 24),
          _AccountTile(icon: Icons.person_outline, title: 'Profile', subtitle: 'Manage your public marketplace profile'),
          _AccountTile(icon: Icons.verified_user_outlined, title: 'Trust', subtitle: 'Verification and account confidence tools'),
          _AccountTile(icon: Icons.storefront_outlined, title: 'Selling', subtitle: 'Manage your listings and seller tools'),
        ],
      ),
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: SuqnaaBrand.blue),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}
