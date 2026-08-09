import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';

enum SafetyDecisionPoint {
  listing,
  messaging,
  checkout,
  pickup,
  shipping,
  payment,
  dispute,
}

class ContextualSafetyGuidance extends StatelessWidget {
  const ContextualSafetyGuidance({
    super.key,
    required this.decisionPoint,
    this.margin = const EdgeInsets.fromLTRB(16, 8, 16, 12),
  });

  final SafetyDecisionPoint decisionPoint;
  final EdgeInsetsGeometry margin;

  bool _isArabic(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'ar';

  ({String title, String body}) _copy(bool ar) {
    return switch (decisionPoint) {
      SafetyDecisionPoint.listing => (
          title: ar ? 'اعرض ما يمكنك تسليمه فقط' : 'List only what you can deliver',
          body: ar
              ? 'استخدم وصفاً وصوراً وسعراً وحالة دقيقة، ولا تعرض سلعاً محظورة أو معلومات اتصال خاصة داخل الإعلان.'
              : 'Use accurate descriptions, photos, price and condition. Do not list prohibited items or put private contact details in the listing.',
        ),
      SafetyDecisionPoint.messaging => (
          title: ar ? 'حافظ على المحادثة داخل سوقنا' : 'Keep the conversation in Suqnaa',
          body: ar
              ? 'لا ترسل كلمات المرور أو رموز الدخول أو بيانات البطاقة. احذر روابط الدفع غير المتوقعة والضغط للانتقال خارج المنصة.'
              : 'Never send passwords, sign-in codes or card details. Treat unexpected payment links and pressure to move off-platform as warning signs.',
        ),
      SafetyDecisionPoint.checkout => (
          title: ar ? 'راجع الطلب قبل المتابعة' : 'Review the order before checkout',
          body: ar
              ? 'تحقق من السلعة والبائع والإجمالي وطريقة الاستلام أو الشحن قبل فتح الدفع المحمي.'
              : 'Check the item, seller, total and pickup or shipping choice before opening protected checkout.',
        ),
      SafetyDecisionPoint.pickup => (
          title: ar ? 'خطط للاستلام الآمن' : 'Plan a safer pickup',
          body: ar
              ? 'فضّل مكاناً عاماً ومضاءً وفي وقت مناسب، وأخبر شخصاً تثق به. لا تشارك عنوان المنزل إلا عند الحاجة.'
              : 'Prefer a public, well-lit place at a sensible time and tell someone you trust. Avoid sharing a home address unless it is necessary.',
        ),
      SafetyDecisionPoint.shipping => (
          title: ar ? 'تحقق من الشحن قبل الدفع' : 'Verify shipping before payment',
          body: ar
              ? 'راجع عنوان المستلم وطريقة الشحن والتكلفة. استخدم التتبع عند توفره ولا تنقل الدفع إلى قناة غير معتمدة.'
              : 'Review the delivery address, shipping method and charge. Use tracking when available and do not move payment to an unapproved channel.',
        ),
      SafetyDecisionPoint.payment => (
          title: ar ? 'ادفع فقط عبر المسار المحمي' : 'Pay only through protected checkout',
          body: ar
              ? 'لا تدفع عبر رابط يرسله مستخدم في الرسائل ولا تشارك بيانات البطاقة أو رموز التحقق. تأكد من المبلغ قبل التأكيد.'
              : 'Do not pay through a link sent by another user and never share card details or verification codes. Confirm the amount before authorising payment.',
        ),
      SafetyDecisionPoint.dispute => (
          title: ar ? 'احتفظ بالأدلة الأصلية' : 'Preserve original evidence',
          body: ar
              ? 'احتفظ بالصور والرسائل وأرقام التتبع والإيصالات كما هي. لا تعدّل الأدلة، وقدّم وصفاً زمنياً دقيقاً للنزاع.'
              : 'Keep photos, messages, tracking records and receipts in their original form. Do not alter evidence, and provide an accurate timeline of the dispute.',
        ),
    };
  }

  Future<void> _openSafetyPolicy(BuildContext context) async {
    final locale = _isArabic(context) ? 'ar' : 'en';
    final base = Uri.parse(MobileEnvironment.webBaseUrl);
    final uri = base.replace(path: '/$locale/policy/safety', query: null, fragment: null);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final ar = _isArabic(context);
    final copy = _copy(ar);
    return Card(
      key: ValueKey('safety-guidance-${decisionPoint.name}'),
      margin: margin,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.shield_outlined, color: SuqnaaBrand.blue),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    copy.title,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(copy.body),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: () => _openSafetyPolicy(context),
              icon: const Icon(Icons.open_in_new, size: 18),
              label: Text(ar ? 'سياسة السلامة' : 'Safety policy'),
            ),
          ],
        ),
      ),
    );
  }
}
