import Link from 'next/link';

type SafetyDecisionPoint =
  | 'listing'
  | 'messaging'
  | 'checkout'
  | 'pickup'
  | 'shipping'
  | 'payment'
  | 'dispute';

type GuidanceCopy = {
  eyebrow: [string, string];
  title: [string, string];
  body: [string, string];
};

const guidance: Record<SafetyDecisionPoint, GuidanceCopy> = {
  listing: {
    eyebrow: ['Listing safety', 'سلامة الإعلان'],
    title: ['Describe the item accurately before publishing', 'صِف العنصر بدقة قبل النشر'],
    body: [
      'Do not hide defects, ownership issues, restrictions or material facts. Never publish prohibited items or move a restricted transaction off-platform to bypass marketplace controls.',
      'لا تُخفِ العيوب أو مشكلات الملكية أو القيود أو المعلومات الجوهرية. لا تنشر عناصر محظورة ولا تنقل معاملة مقيّدة خارج المنصة لتجاوز ضوابط السوق.'
    ]
  },
  messaging: {
    eyebrow: ['Messaging safety', 'سلامة المراسلة'],
    title: ['Keep transaction evidence in Suqnaa', 'احتفظ بأدلة المعاملة داخل سوقنا'],
    body: [
      'Be cautious with pressure, requests for passwords or verification codes, unexpected payment links, and attempts to move the conversation away from Suqnaa. Report suspicious messages instead of acting on them.',
      'كن حذراً من الضغط أو طلب كلمات المرور أو رموز التحقق أو روابط الدفع غير المتوقعة أو محاولات نقل المحادثة خارج سوقنا. أبلغ عن الرسائل المشبوهة بدلاً من الاستجابة لها.'
    ]
  },
  checkout: {
    eyebrow: ['Checkout safety', 'سلامة إتمام الشراء'],
    title: ['Check the seller, item and fulfilment choice', 'تحقق من البائع والعنصر وطريقة الاستلام'],
    body: [
      'Review the stored order, listing description, seller identity shown to you, total amount and delivery or pickup choice before continuing. Stop if the transaction details do not match what you agreed.',
      'راجع الطلب المحفوظ ووصف الإعلان وهوية البائع المعروضة لك والمبلغ الإجمالي وطريقة الشحن أو الاستلام قبل المتابعة. توقف إذا لم تتطابق تفاصيل المعاملة مع ما اتفقت عليه.'
    ]
  },
  pickup: {
    eyebrow: ['Pickup safety', 'سلامة الاستلام'],
    title: ['Use a safe handover and verify the item', 'استخدم تسليماً آمناً وتحقق من العنصر'],
    body: [
      'Prefer a suitable public or otherwise safe meeting place, do not disclose unnecessary private-location details, inspect the item before confirming receipt, and use the platform handover proof where available.',
      'فضّل مكاناً عاماً مناسباً أو مكاناً آمناً، ولا تكشف تفاصيل موقع خاصة غير ضرورية، وافحص العنصر قبل تأكيد الاستلام، واستخدم إثبات التسليم داخل المنصة عند توفره.'
    ]
  },
  shipping: {
    eyebrow: ['Shipping safety', 'سلامة الشحن'],
    title: ['Use the stored address and traceable delivery', 'استخدم العنوان المحفوظ وشحناً قابلاً للتتبع'],
    body: [
      'Use the order delivery details rather than addresses sent only in chat. Keep tracking and dispatch evidence, package items appropriately, and do not mark an item delivered before the carrier or buyer evidence supports it.',
      'استخدم تفاصيل التسليم المحفوظة في الطلب بدلاً من العناوين المرسلة فقط في المحادثة. احتفظ بأدلة التتبع والإرسال، وغلّف العنصر بشكل مناسب، ولا تعتبره مُسلّماً قبل وجود دليل من شركة الشحن أو المشتري.'
    ]
  },
  payment: {
    eyebrow: ['Payment safety', 'سلامة الدفع'],
    title: ['Pay only through the protected checkout shown here', 'ادفع فقط عبر صفحة الدفع المحمية المعروضة هنا'],
    body: [
      'Do not send money to bank details, wallet addresses or payment links supplied in messages to bypass protected checkout. Suqnaa never needs your card password, PIN or one-time authentication code in chat.',
      'لا ترسل أموالاً إلى بيانات مصرفية أو عناوين محافظ أو روابط دفع واردة في الرسائل لتجاوز الدفع المحمي. لا تحتاج سوقنا أبداً إلى كلمة مرور بطاقتك أو الرقم السري أو رمز التحقق لمرة واحدة داخل المحادثة.'
    ]
  },
  dispute: {
    eyebrow: ['Dispute safety', 'سلامة النزاع'],
    title: ['Submit factual evidence and keep originals', 'قدّم أدلة واقعية واحتفظ بالأصول'],
    body: [
      'Describe what happened accurately, preserve original photos, messages, tracking and payment records, and do not edit or fabricate evidence. Avoid harassment or threats while a dispute is being reviewed.',
      'اشرح ما حدث بدقة، واحتفظ بالصور والرسائل وبيانات التتبع والدفع الأصلية، ولا تعدّل الأدلة أو تختلقها. تجنب المضايقة أو التهديد أثناء مراجعة النزاع.'
    ]
  }
};

export function ContextualSafetyGuidance({
  locale,
  point,
  compact = false
}: {
  locale: string;
  point: SafetyDecisionPoint;
  compact?: boolean;
}) {
  const ar = locale === 'ar';
  const copy = guidance[point];

  return (
    <aside
      className={compact ? 'order-safety-card safety-guidance compact' : 'order-safety-card safety-guidance'}
      role="note"
      data-safety-point={point}
      aria-label={copy.eyebrow[ar ? 1 : 0]}
    >
      <span className="buyer-action-label">{copy.eyebrow[ar ? 1 : 0]}</span>
      <h3>{copy.title[ar ? 1 : 0]}</h3>
      <p>{copy.body[ar ? 1 : 0]}</p>
      <Link href={`/${locale}/policy/safety`}>
        {ar ? 'اقرأ إرشادات السلامة' : 'Read safety guidance'}
      </Link>
    </aside>
  );
}

export const safetyDecisionPoints = Object.freeze([
  'listing', 'messaging', 'checkout', 'pickup', 'shipping', 'payment', 'dispute'
] as const);
