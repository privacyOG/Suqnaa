import 'package:flutter/material.dart';
import '../../brand/brand.dart';
import '../../session/session_scope.dart';
import '../conversations/conversation_inbox_screen.dart';
import 'sign_in_screen.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final signedIn = session.isSignedIn;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Account'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            signedIn
                ? 'Welcome, ${session.displayName ?? 'Suqnaa user'}'
                : 'Your Suqnaa account',
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w900,
              color: SuqnaaBrand.blue,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            signedIn
                ? 'Manage your marketplace activity and conversations.'
                : 'Sign in to access your profile, listings, and messages.',
          ),
          const SizedBox(height: 24),
          if (!signedIn)
            _AccountTile(
              icon: Icons.login,
              title: 'Sign in',
              subtitle: 'Connect your Suqnaa account',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SignInScreen()),
              ),
            ),
          const _AccountTile(
            icon: Icons.person_outline,
            title: 'Profile',
            subtitle: 'Manage your public marketplace profile',
          ),
          _AccountTile(
            icon: Icons.forum_outlined,
            title: 'Messages',
            subtitle: signedIn
                ? 'View conversations with buyers and sellers'
                : 'Sign in to view your conversations',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn
                    ? const ConversationInboxScreen()
                    : const SignInScreen(),
              ),
            ),
          ),
          const _AccountTile(
            icon: Icons.verified_user_outlined,
            title: 'Trust',
            subtitle: 'Verification and account confidence tools',
          ),
          const _AccountTile(
            icon: Icons.storefront_outlined,
            title: 'Selling',
            subtitle: 'Manage your listings and seller tools',
          ),
          if (signedIn)
            _AccountTile(
              icon: Icons.logout,
              title: 'Sign out',
              subtitle: 'Revoke and clear this device session',
              onTap: () async {
                await session.signOut();
                if (!context.mounted) {
                  return;
                }
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Signed out')),
                );
              },
            ),
        ],
      ),
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: SuqnaaBrand.blue),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
