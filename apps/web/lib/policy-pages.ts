import type { Locale } from '../i18n/locales';

export const policySlugs = ['terms', 'privacy', 'items', 'safety', 'contact'] as const;
export type PolicySlug = (typeof policySlugs)[number];

type PolicyPage = {
  title: string;
  summary: string;
  sections: Array<{ title: string; body: string }>;
};

type PolicyDictionary = Record<PolicySlug, PolicyPage>;

const en: PolicyDictionary = {
  terms: {
    title: 'Terms',
    summary: 'Draft platform terms for Suqnaa beta readiness. These must be reviewed before public launch.',
    sections: [
      { title: 'Beta status', body: 'Suqnaa is being prepared for staging and public beta. Features, rules, fees, and availability may change before full launch.' },
      { title: 'Accounts', body: 'Users should provide accurate account information and keep login details secure. Accounts may be limited if they create safety, fraud, or trust risks.' },
      { title: 'Marketplace conduct', body: 'Listings, messages, offers, and transactions should be honest, lawful, and respectful. Suqnaa may moderate content to protect the marketplace.' },
      { title: 'Final review required', body: 'This draft does not replace final legal terms. A completed legal review is required before accepting real public marketplace activity.' }
    ]
  },
  privacy: {
    title: 'Privacy',
    summary: 'Draft privacy overview for Suqnaa beta readiness. Final privacy wording must match the production data flows.',
    sections: [
      { title: 'Data minimisation', body: 'Suqnaa should only collect information needed to provide accounts, listings, messages, trust controls, support, and abuse prevention.' },
      { title: 'Account security', body: 'Sensitive account data should be protected with secure authentication, restricted access, audit logging, and production secrets outside source control.' },
      { title: 'Marketplace records', body: 'Listings, messages, offers, reports, and order activity may need to be retained to operate the marketplace and respond to safety issues.' },
      { title: 'Final review required', body: 'This draft must be replaced with a final privacy policy before public launch.' }
    ]
  },
  items: {
    title: 'Marketplace item rules',
    summary: 'Draft item-rules placeholder for Suqnaa beta readiness. The final rules must be clear before public marketplace launch.',
    sections: [
      { title: 'Allowed listings', body: 'Listings should be lawful, accurately described, and suitable for a trusted marketplace environment.' },
      { title: 'Restricted categories', body: 'Some categories may need to be blocked, reviewed, age-gated, or handled through special compliance processes before they can appear on Suqnaa.' },
      { title: 'Moderation', body: 'Suqnaa should support review, reporting, takedown, and appeal workflows before allowing public listings at scale.' },
      { title: 'Final review required', body: 'A complete item policy must be written and approved before full launch.' }
    ]
  },
  safety: {
    title: 'Safety',
    summary: 'Draft safety guidance for Suqnaa beta readiness. Final buyer and seller guidance should be linked throughout the marketplace.',
    sections: [
      { title: 'Safer trading', body: 'Users should communicate through Suqnaa where possible, review listings carefully, and avoid pressure tactics or unclear terms.' },
      { title: 'Trust signals', body: 'Verification, account age, seller history, listing quality, and marketplace reports should be used to help users make safer decisions.' },
      { title: 'Reporting', body: 'Users should be able to report suspicious accounts, listings, messages, offers, and order activity before public beta.' },
      { title: 'Final review required', body: 'Safety guidance must be reviewed against the real product workflow before public launch.' }
    ]
  },
  contact: {
    title: 'Contact',
    summary: 'Draft contact page for Suqnaa beta readiness.',
    sections: [
      { title: 'Support', body: 'Add the official Suqnaa support email, business details, and response expectations before public launch.' },
      { title: 'Reports', body: 'Add a dedicated channel for account, listing, privacy, and safety reports before public beta.' },
      { title: 'Business enquiries', body: 'Add the correct contact path for partnerships, providers, and marketplace operations.' }
    ]
  }
};

const ar: PolicyDictionary = {
  terms: {
    title: 'الشروط',
    summary: 'مسودة شروط للجاهزية التجريبية في سوقنا. يجب مراجعتها قبل الإطلاق العام.',
    sections: [
      { title: 'الحالة التجريبية', body: 'سوقنا قيد التجهيز للبيئة التجريبية والإطلاق التجريبي العام. قد تتغير الميزات والقواعد والرسوم قبل الإطلاق الكامل.' },
      { title: 'الحسابات', body: 'ينبغي للمستخدمين تقديم معلومات حساب صحيحة والحفاظ على سرية بيانات الدخول. قد يتم تقييد الحسابات التي تسبب مخاطر على الثقة أو السلامة.' },
      { title: 'سلوك السوق', body: 'ينبغي أن تكون الإعلانات والرسائل والعروض والتعاملات صادقة وقانونية ومحترمة. قد تراجع سوقنا المحتوى لحماية المنصة.' },
      { title: 'مراجعة نهائية مطلوبة', body: 'هذه المسودة لا تغني عن الشروط القانونية النهائية. يجب إكمال المراجعة قبل النشاط العام الحقيقي.' }
    ]
  },
  privacy: {
    title: 'الخصوصية',
    summary: 'مسودة خصوصية للجاهزية التجريبية في سوقنا. يجب أن تطابق الصياغة النهائية تدفقات البيانات الفعلية.',
    sections: [
      { title: 'تقليل البيانات', body: 'ينبغي أن تجمع سوقنا المعلومات اللازمة فقط للحسابات والإعلانات والرسائل والثقة والدعم ومنع إساءة الاستخدام.' },
      { title: 'أمان الحساب', body: 'يجب حماية بيانات الحساب الحساسة بالمصادقة الآمنة، وتقييد الوصول، وسجلات المراجعة، وإبقاء أسرار الإنتاج خارج الكود.' },
      { title: 'سجلات السوق', body: 'قد يلزم الاحتفاظ بالإعلانات والرسائل والعروض والبلاغات ونشاط الطلبات لتشغيل السوق والتعامل مع مسائل السلامة.' },
      { title: 'مراجعة نهائية مطلوبة', body: 'يجب استبدال هذه المسودة بسياسة خصوصية نهائية قبل الإطلاق العام.' }
    ]
  },
  items: {
    title: 'قواعد عناصر السوق',
    summary: 'مسودة لقواعد العناصر ضمن جاهزية سوقنا التجريبية. يجب توضيح القواعد النهائية قبل الإطلاق العام.',
    sections: [
      { title: 'الإعلانات المقبولة', body: 'يجب أن تكون الإعلانات قانونية وموصوفة بدقة ومناسبة لبيئة سوق موثوقة.' },
      { title: 'الفئات المقيدة', body: 'قد تحتاج بعض الفئات إلى المنع أو المراجعة أو ضوابط خاصة قبل ظهورها في سوقنا.' },
      { title: 'الإشراف', body: 'ينبغي دعم المراجعة والبلاغات والإزالة والاعتراض قبل السماح بالإعلانات العامة على نطاق واسع.' },
      { title: 'مراجعة نهائية مطلوبة', body: 'يجب كتابة واعتماد سياسة كاملة للعناصر قبل الإطلاق الكامل.' }
    ]
  },
  safety: {
    title: 'الأمان',
    summary: 'مسودة إرشادات أمان للجاهزية التجريبية في سوقنا. يجب ربط الإرشادات النهائية في صفحات السوق.',
    sections: [
      { title: 'تجارة أكثر أماناً', body: 'ينبغي للمستخدمين التواصل عبر سوقنا قدر الإمكان، ومراجعة الإعلانات بعناية، وتجنب الضغط أو الشروط غير الواضحة.' },
      { title: 'إشارات الثقة', body: 'ينبغي استخدام التحقق وعمر الحساب وسجل البائع وجودة الإعلان والبلاغات لمساعدة المستخدمين على قرارات أكثر أماناً.' },
      { title: 'البلاغات', body: 'ينبغي تمكين المستخدمين من الإبلاغ عن الحسابات والإعلانات والرسائل والعروض ونشاط الطلبات المشبوه قبل الإطلاق التجريبي العام.' },
      { title: 'مراجعة نهائية مطلوبة', body: 'يجب مراجعة إرشادات الأمان وفق مسار المنتج الحقيقي قبل الإطلاق العام.' }
    ]
  },
  contact: {
    title: 'التواصل',
    summary: 'مسودة صفحة تواصل للجاهزية التجريبية في سوقنا.',
    sections: [
      { title: 'الدعم', body: 'أضف بريد الدعم الرسمي وبيانات العمل وتوقعات الرد قبل الإطلاق العام.' },
      { title: 'البلاغات', body: 'أضف قناة مخصصة لبلاغات الحسابات والإعلانات والخصوصية والأمان قبل الإطلاق التجريبي العام.' },
      { title: 'استفسارات الأعمال', body: 'أضف المسار الصحيح للشراكات والمزودين وعمليات السوق.' }
    ]
  }
};

export function getPolicyPage(locale: Locale, slug: string): PolicyPage | null {
  if (!policySlugs.includes(slug as PolicySlug)) {
    return null;
  }

  const pages = locale === 'ar' ? ar : en;
  return pages[slug as PolicySlug];
}
