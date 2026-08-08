import 'package:flutter/material.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../brand/brand.dart';
import '../../session/session_scope.dart';
import '../conversations/session_conversation_inbox.dart';
import '../discovery/discovery_screen.dart';
import '../notifications/notification_screen.dart';
import '../orders/delivery_pickup_screen.dart';
import '../orders/dispute_screen.dart';
import '../orders/order_activity_screen.dart';
import '../orders/order_cancellation_screen.dart';
import '../orders/order_fulfilment_screen.dart';
import '../orders/payment_preparation_screen.dart';
import '../sell/listing_media_manager_screen.dart';
import '../sell/my_listings_screen.dart';
import 'account_login_screen.dart';
import 'account_profile_screen.dart';
import 'account_security_screen.dart';
import 'account_verification_screen.dart';
import 'password_recovery_screen.dart';
import 'register_screen.dart';
import 'secure_web_handoff_tile.dart';
import 'seller_payout_screen.dart';
import 'seller_verification_screen.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final signedIn = session.isSignedIn;
    final text = AppLocalizations.of(context);
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    return Scaffold(
      appBar: AppBar(
        title: Text(text.account),
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
                : 'Create an account or sign in to access marketplace tools.',
          ),
          const SizedBox(height: 24),
          if (!signedIn) ...[
            _AccountTile(
              icon: Icons.person_add_alt_1,
              title: 'Create account',
              subtitle: 'Join Suqnaa as a buyer or seller',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const RegisterScreen()),
              ),
            ),
            _AccountTile(
              icon: Icons.login,
              title: 'Sign in',
              subtitle: 'Connect your existing Suqnaa account',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AccountLoginScreen()),
              ),
            ),
            _AccountTile(
              key: const Key('password-recovery-account-tile'),
              icon: Icons.lock_reset_outlined,
              title: isArabic ? 'استعادة كلمة المرور' : 'Password recovery',
              subtitle: isArabic
                  ? 'اطلب رمز إعادة تعيين أو استخدم رمزاً مستلماً'
                  : 'Request a reset or use a token you received',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PasswordRecoveryScreen()),
              ),
            ),
          ],
          _AccountTile(
            key: const Key('account-profile-tile'),
            icon: Icons.person_outline,
            title: isArabic ? 'الملف والخصوصية' : 'Profile and privacy',
            subtitle: signedIn
                ? (isArabic
                    ? 'عدّل الملف والبيانات التجارية والخصوصية وبيانات الحساب'
                    : 'Edit profile, business details, privacy, and account data')
                : (isArabic ? 'سجّل الدخول لإدارة ملفك' : 'Sign in to manage your profile'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn
                    ? const AccountProfileScreen()
                    : const AccountLoginScreen(),
              ),
            ),
          ),
          if (signedIn) ...[
            _AccountTile(
              key: const Key('notification-account-tile'),
              icon: Icons.notifications_outlined,
              title: isArabic ? 'الإشعارات وقنوات التوصيل' : 'Notifications and delivery channels',
              subtitle: isArabic
                  ? 'راجع نشاط السوق واضبط البريد وSMS والإشعارات الفورية'
                  : 'Review marketplace activity and manage email, SMS, and push',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const NotificationScreen()),
              ),
            ),
            _AccountTile(
              key: const Key('seller-verification-account-tile'),
              icon: Icons.badge_outlined,
              title: isArabic ? 'تحقق البائع' : 'Seller verification',
              subtitle: isArabic
                  ? 'تحقق من هوية البائع أو بيانات النشاط التجاري وتابع الحالة'
                  : 'Verify seller or business identity and track status',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SellerVerificationScreen()),
              ),
            ),
            _AccountTile(
              key: const Key('seller-payout-account-tile'),
              icon: Icons.account_balance_outlined,
              title: isArabic ? 'تسويات ودفعات البائع' : 'Seller settlements and payouts',
              subtitle: isArabic
                  ? 'أكمل إعداد الدفعات وتابع حالة التحويل'
                  : 'Complete payout setup and review transfer readiness',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SellerPayoutScreen()),
              ),
            ),
            _AccountTile(
              key: const Key('account-contact-verification-tile'),
              icon: Icons.verified_user_outlined,
              title: isArabic ? 'التحقق من الحساب' : 'Account verification',
              subtitle: isArabic
                  ? 'تحقق من البريد الإلكتروني أو رقم الهاتف المسجل'
                  : 'Verify your registered email or phone',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AccountVerificationScreen()),
              ),
            ),
            _AccountTile(
              key: const Key('account-security-tile'),
              icon: Icons.security_outlined,
              title: isArabic ? 'كلمة المرور والجلسات' : 'Password and sessions',
              subtitle: isArabic
                  ? 'غيّر كلمة المرور وراجع الجلسات النشطة'
                  : 'Change your password and review active sessions',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AccountSecurityScreen()),
              ),
            ),
            _AccountTile(
              key: const Key('discovery-account-tile'),
              icon: Icons.bookmarks_outlined,
              title: isArabic ? 'المحفوظات والمراقبة والتنبيهات' : 'Saved items, watchlist and alerts',
              subtitle: isArabic
                  ? 'راجع الإعلانات المحفوظة والمشاهدة والبحث والتنبيهات'
                  : 'Review saved listings, watchlist, recent views, searches and alerts',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DiscoveryScreen()),
              ),
            ),
          ],
          _AccountTile(
            icon: Icons.forum_outlined,
            title: 'Messages',
            subtitle: signedIn
                ? 'View conversations with buyers and sellers'
                : 'Sign in to view your conversations',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn
                    ? const SessionConversationInbox()
                    : const AccountLoginScreen(),
              ),
            ),
          ),
          _AccountTile(
            icon: Icons.receipt_long_outlined,
            title: text.orders,
            subtitle: signedIn ? text.orderHistorySubtitle : 'Sign in to view your orders',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn ? const OrderActivityScreen() : const AccountLoginScreen(),
              ),
            ),
          ),
          _AccountTile(
            key: const Key('disputes-account-tile'),
            icon: Icons.gavel_outlined,
            title: isArabic ? 'النزاعات' : 'Disputes',
            subtitle: signedIn
                ? (isArabic ? 'افتح نزاعاً وأرسل الردود والأدلة وتابع المراجعة والاستئناف' : 'Open cases, submit responses and evidence, and track review or appeal')
                : (isArabic ? 'سجّل الدخول لإدارة النزاعات' : 'Sign in to manage disputes'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => signedIn ? const DisputeScreen() : const AccountLoginScreen()),
            ),
          ),
          _AccountTile(
            key: const Key('delivery-pickup-account-tile'),
            icon: Icons.route_outlined,
            title: isArabic ? 'التسليم والاستلام' : 'Delivery and pickup',
            subtitle: signedIn
                ? (isArabic
                    ? 'اختر الشحن أو الاستلام وتابع العناوين والتتبع وإثبات الاستلام'
                    : 'Choose shipping or pickup and manage protected addresses, tracking and pickup proof')
                : (isArabic ? 'سجّل الدخول لإدارة التسليم' : 'Sign in to manage delivery'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn ? const DeliveryPickupScreen() : const AccountLoginScreen(),
              ),
            ),
          ),
          _AccountTile(
            icon: Icons.local_shipping_outlined,
            title: text.fulfilmentActions,
            subtitle: signedIn ? text.fulfilmentActionsSubtitle : text.signInForFulfilmentActions,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn ? const OrderFulfilmentScreen() : const AccountLoginScreen(),
              ),
            ),
          ),
          _AccountTile(
            icon: Icons.cancel_outlined,
            title: text.cancelOrder,
            subtitle: signedIn ? text.cancelOrderTitle : 'Sign in to cancel an order',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn ? const OrderCancellationScreen() : const AccountLoginScreen(),
              ),
            ),
          ),
          _AccountTile(
            icon: Icons.payments_outlined,
            title: text.paymentPreparation,
            subtitle: signedIn ? text.paymentPreparationSubtitle : 'Sign in to prepare payment',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn ? const PaymentPreparationScreen() : const AccountLoginScreen(),
              ),
            ),
          ),
          if (signedIn) const SecureWebHandoffTile(),
          _AccountTile(
            icon: Icons.storefront_outlined,
            title: 'Selling',
            subtitle: signedIn
                ? 'Manage your listings and create new drafts'
                : 'Sign in to manage your listings',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn ? const MyListingsScreen() : const AccountLoginScreen(),
              ),
            ),
          ),
          _AccountTile(
            key: const Key('listing-photo-manager-account-tile'),
            icon: Icons.photo_library_outlined,
            title: 'Listing photos',
            subtitle: signedIn
                ? 'Upload and manage listing photos'
                : 'Sign in to manage listing photos',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn ? const ListingMediaManagerScreen() : const AccountLoginScreen(),
              ),
            ),
          ),
          if (signedIn)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: OutlinedButton.icon(
                onPressed: session.signOut,
                icon: const Icon(Icons.logout),
                label: const Text('Sign out'),
              ),
            ),
        ],
      ),
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: Icon(icon, color: SuqnaaBrand.blue),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
