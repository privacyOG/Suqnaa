export const legalPolicySlugs = [
  'terms',
  'privacy',
  'item-rules',
  'safety',
  'payments',
  'refunds',
  'disputes',
  'returns',
  'acceptable-use',
  'contact',
  'data-retention'
] as const;

export type LegalPolicySlug = (typeof legalPolicySlugs)[number];
export type LegalPolicyLocale = 'en' | 'ar';
export type LegalPolicyReviewStatus = 'pending_legal_review' | 'approved';

type PolicySection = { heading: string; paragraphs: string[] };
type LocalizedPolicy = { title: string; summary: string; sections: PolicySection[] };

export type LegalPolicyDocument = {
  slug: LegalPolicySlug;
  version: string;
  reviewStatus: LegalPolicyReviewStatus;
  effectiveDate: string | null;
  lastUpdated: string;
  en: LocalizedPolicy;
  ar: LocalizedPolicy;
};

const candidateMeta = {
  version: '2026-08-candidate-1',
  reviewStatus: 'pending_legal_review' as const,
  effectiveDate: null,
  lastUpdated: '2026-08-09'
};

export const legalPolicies: Record<LegalPolicySlug, LegalPolicyDocument> = {
  terms: {
    slug: 'terms', ...candidateMeta,
    en: {
      title: 'Marketplace Terms',
      summary: 'Candidate terms for use of the Suqnaa marketplace in Australia. Legal approval is required before these terms become effective.',
      sections: [
        { heading: 'Marketplace role', paragraphs: [
          'Suqnaa is designed as a marketplace intermediary. Sellers supply the goods or services they list, and buyers contract with the relevant seller for the underlying supply.',
          'Suqnaa provides discovery, messaging, transaction workflow, payment orchestration, safety controls and contractual marketplace protection. Suqnaa does not take title to a seller’s goods merely because a transaction is completed through the platform.'
        ]},
        { heading: 'Accounts and truthful information', paragraphs: [
          'Users must provide accurate account and transaction information, keep authentication credentials secure, and must not impersonate another person or misrepresent a business, listing, price, availability or transaction status.',
          'Account access may be limited or suspended where required for security, moderation, legal compliance or marketplace integrity, subject to applicable appeal processes.'
        ]},
        { heading: 'Transactions and statutory rights', paragraphs: [
          'Business sellers remain responsible for obligations that apply to their supply, including non-excludable rights that may arise under the Australian Consumer Law. Platform protection does not replace rights that cannot lawfully be excluded.',
          'Private and business sellers may have different legal obligations. The marketplace may display seller status or verification information where relevant to a transaction.'
        ]},
        { heading: 'Payments and fees', paragraphs: [
          'Protected checkout is initially limited to eligible Australian transactions in AUD using approved payment methods. Payment processing and seller payouts are handled through the approved regulated payment-provider infrastructure rather than a Suqnaa stored-value balance.',
          'Any marketplace fee, seller fee, shipping amount or other charge presented by Suqnaa must be disclosed before the relevant transaction is confirmed.'
        ]},
        { heading: 'Enforcement and changes', paragraphs: [
          'Listings, accounts and transactions may be reviewed under the item, safety, fraud and acceptable-use rules. Risk signals support review but do not by themselves execute account, listing or money-movement actions.',
          'Material changes to effective terms should be versioned, dated and communicated in an appropriate way before they apply.'
        ]}
      ]
    },
    ar: {
      title: 'شروط السوق',
      summary: 'صياغة مرشحة لشروط استخدام سوق سوقنا في أستراليا. يلزم اعتماد قانوني قبل أن تصبح هذه الشروط نافذة.',
      sections: [
        { heading: 'دور السوق', paragraphs: [
          'صُممت سوقنا لتعمل كوسيط سوق. يقدّم البائعون السلع أو الخدمات التي يعرضونها، ويتعاقد المشتري مع البائع المعني بشأن التوريد الأساسي.',
          'توفر سوقنا الاكتشاف والمراسلة ومسار المعاملة وتنظيم الدفع وضوابط السلامة والحماية التعاقدية للسوق. ولا تنتقل ملكية سلعة البائع إلى سوقنا لمجرد إتمام المعاملة عبر المنصة.'
        ]},
        { heading: 'الحسابات وصحة المعلومات', paragraphs: [
          'يجب على المستخدمين تقديم معلومات صحيحة عن الحساب والمعاملة، وحماية بيانات الدخول، وعدم انتحال شخصية الغير أو تحريف صفة نشاط تجاري أو إعلان أو سعر أو توافر أو حالة معاملة.',
          'قد يُقيّد الوصول إلى الحساب أو يُعلّق عند الحاجة للأمن أو الإشراف أو الامتثال القانوني أو سلامة السوق، مع مراعاة إجراءات الاستئناف المطبقة.'
        ]},
        { heading: 'المعاملات والحقوق القانونية', paragraphs: [
          'يبقى البائع التجاري مسؤولاً عن الالتزامات المطبقة على توريده، بما في ذلك الحقوق غير القابلة للاستبعاد التي قد تنشأ بموجب قانون المستهلك الأسترالي. ولا تحل حماية المنصة محل الحقوق التي لا يجوز استبعادها قانوناً.',
          'قد تختلف الالتزامات القانونية بين البائع الخاص والبائع التجاري، وقد يعرض السوق صفة البائع أو معلومات التحقق عندما تكون ذات صلة بالمعاملة.'
        ]},
        { heading: 'المدفوعات والرسوم', paragraphs: [
          'يقتصر الدفع المحمي في الإطلاق الأولي على المعاملات الأسترالية المؤهلة بالدولار الأسترالي وبوسائل دفع معتمدة. تتم معالجة المدفوعات ومدفوعات البائعين عبر بنية مزود الدفع المنظم المعتمد وليس عبر رصيد مخزن لدى سوقنا.',
          'يجب الإفصاح عن أي رسوم سوق أو رسوم بائع أو شحن أو مبالغ أخرى تعرضها سوقنا قبل تأكيد المعاملة ذات الصلة.'
        ]},
        { heading: 'التنفيذ والتغييرات', paragraphs: [
          'قد تخضع الإعلانات والحسابات والمعاملات للمراجعة وفق قواعد العناصر والسلامة والاحتيال والاستخدام المقبول. تساعد إشارات المخاطر في المراجعة لكنها لا تنفذ وحدها إجراءات على الحساب أو الإعلان أو الأموال.',
          'ينبغي إصدار التغييرات الجوهرية على الشروط النافذة برقم إصدار وتاريخ وإبلاغ المستخدمين بها بالطريقة المناسبة قبل سريانها.'
        ]}
      ]
    }
  },
  privacy: {
    slug: 'privacy', ...candidateMeta,
    en: {
      title: 'Privacy Policy',
      summary: 'Candidate privacy policy describing Suqnaa’s intended handling of personal information for the Australian launch.',
      sections: [
        { heading: 'Information we handle', paragraphs: [
          'Depending on the service used, Suqnaa may handle account identifiers, profile and business information, verification status, listings, messages, transaction and fulfilment records, support and moderation records, security events, device or network security signals, and provider references needed for payment, payout and reconciliation workflows.',
          'Suqnaa is designed not to store raw card numbers, CVV/CVC values, bank credentials or wallet secrets. Sensitive payment and seller-payout details should remain within approved provider-controlled systems where practicable.'
        ]},
        { heading: 'Purposes', paragraphs: [
          'Information may be used to provide accounts and marketplace functions, process and reconcile transactions, support delivery and disputes, prevent abuse, operate moderation and appeals, communicate service or security notices, comply with legal obligations, and maintain audit and accounting records.',
          'Automated rules may generate risk or safety signals for review. The policy must be revisited before any automated decision arrangement becomes subject to additional Australian privacy-policy disclosure requirements.'
        ]},
        { heading: 'Sharing and overseas handling', paragraphs: [
          'Information may be disclosed to service providers where needed to operate the marketplace, including approved identity, communications, infrastructure and payment providers, and to authorities or other recipients where required or authorised by law.',
          'Before launch, legal review must confirm the likely countries of overseas recipients where practicable and the safeguards applicable to cross-border disclosures.'
        ]},
        { heading: 'Access, correction and complaints', paragraphs: [
          'Users should be able to request access to or correction of personal information held about them, subject to applicable legal exceptions. The final policy must publish stable privacy-contact details and explain how privacy complaints are handled.',
          'Account export and profile correction features do not limit any additional access or correction rights that apply by law.'
        ]},
        { heading: 'Security and retention', paragraphs: [
          'Suqnaa uses access controls, audit records, bounded evidence retention and other security measures designed to reduce unauthorised access, disclosure or misuse. No security measure can eliminate every risk.',
          'Personal information should be deleted or de-identified when no longer required unless retention is required or authorised by law or remains necessary for a legitimate operational, dispute, fraud, accounting or compliance purpose. See the Data Retention Policy for the candidate schedule.'
        ]}
      ]
    },
    ar: {
      title: 'سياسة الخصوصية',
      summary: 'صياغة مرشحة لسياسة الخصوصية توضح طريقة تعامل سوقنا المقصودة مع المعلومات الشخصية في الإطلاق الأسترالي.',
      sections: [
        { heading: 'المعلومات التي نتعامل معها', paragraphs: [
          'بحسب الخدمة المستخدمة، قد تتعامل سوقنا مع معرفات الحساب وبيانات الملف والنشاط التجاري وحالة التحقق والإعلانات والرسائل وسجلات المعاملات والتنفيذ والدعم والإشراف وأحداث الأمان وإشارات أمان الجهاز أو الشبكة ومراجع المزود اللازمة للدفع والتحويل والتسوية.',
          'صُممت سوقنا بحيث لا تخزن أرقام البطاقات الكاملة أو قيم CVV/CVC أو بيانات الدخول البنكية أو أسرار المحافظ. وينبغي إبقاء بيانات الدفع وتحويلات البائع الحساسة داخل الأنظمة الخاضعة لسيطرة المزود المعتمد كلما أمكن.'
        ]},
        { heading: 'الأغراض', paragraphs: [
          'قد تستخدم المعلومات لتوفير الحسابات ووظائف السوق ومعالجة المعاملات وتسويتها ودعم التوصيل والنزاعات ومنع إساءة الاستخدام وتشغيل الإشراف والاستئنافات وإرسال إشعارات الخدمة أو الأمان والوفاء بالالتزامات القانونية والاحتفاظ بسجلات التدقيق والمحاسبة.',
          'قد تنشئ القواعد الآلية إشارات مخاطر أو سلامة للمراجعة. ويجب إعادة مراجعة السياسة قبل خضوع أي ترتيب لاتخاذ قرار آلي لمتطلبات إفصاح إضافية في سياسة الخصوصية الأسترالية.'
        ]},
        { heading: 'المشاركة والمعالجة خارج أستراليا', paragraphs: [
          'قد تُفصح المعلومات لمزودي الخدمات عند الحاجة لتشغيل السوق، بما في ذلك مزودو التحقق والاتصالات والبنية التحتية والمدفوعات المعتمدون، وللسلطات أو جهات أخرى عندما يجيز القانون ذلك أو يطلبه.',
          'قبل الإطلاق يجب أن تؤكد المراجعة القانونية البلدان المحتملة لمتلقي المعلومات في الخارج حيث يكون تحديدها عملياً والضمانات المطبقة على الإفصاح العابر للحدود.'
        ]},
        { heading: 'الوصول والتصحيح والشكاوى', paragraphs: [
          'ينبغي أن يتمكن المستخدم من طلب الوصول إلى معلوماته الشخصية أو تصحيحها، مع مراعاة الاستثناءات القانونية المطبقة. ويجب أن تنشر السياسة النهائية بيانات اتصال ثابتة للخصوصية وتشرح كيفية التعامل مع شكاوى الخصوصية.',
          'لا تحد ميزات تصدير الحساب وتصحيح الملف من أي حقوق إضافية للوصول أو التصحيح يقررها القانون.'
        ]},
        { heading: 'الأمان والاحتفاظ', paragraphs: [
          'تستخدم سوقنا ضوابط وصول وسجلات تدقيق واحتفاظاً محدوداً بالأدلة وتدابير أمنية أخرى تهدف إلى تقليل الوصول أو الإفصاح أو الاستخدام غير المصرح به. ولا يمكن لأي إجراء أمني إزالة جميع المخاطر.',
          'ينبغي حذف المعلومات الشخصية أو نزع هويتها عندما تنتفي الحاجة إليها، ما لم يكن الاحتفاظ بها مطلوباً أو مسموحاً به قانوناً أو لازماً لغرض تشغيلي أو نزاع أو احتيال أو محاسبة أو امتثال مشروع. راجع سياسة الاحتفاظ بالبيانات للجدول المرشح.'
        ]}
      ]
    }
  },
  'item-rules': {
    slug: 'item-rules', ...candidateMeta,
    en: { title: 'Item Rules', summary: 'Candidate rules for what may be listed on Suqnaa.', sections: [
      { heading: 'General rule', paragraphs: ['Listings must be lawful, accurately described, owned or authorised for sale by the seller, and compatible with the marketplace’s launch-country and payment requirements.'] },
      { heading: 'Prohibited and restricted items', paragraphs: ['Items prohibited by law, unsafe products, stolen or counterfeit goods, regulated weapons, prohibited drugs, unlawful services, and other categories designated by the active moderation policy must not be listed.', 'A category may be blocked outright or routed to manual review. A seller must not evade a restriction by changing wording, category, images or account.'] },
      { heading: 'Product safety', paragraphs: ['Sellers are responsible for applicable product safety standards, mandatory warnings, recalls and bans. Suqnaa may remove or restrict an item where safety or compliance concerns arise.'] }
    ]},
    ar: { title: 'قواعد العناصر', summary: 'قواعد مرشحة لما يجوز عرضه في سوقنا.', sections: [
      { heading: 'القاعدة العامة', paragraphs: ['يجب أن تكون الإعلانات قانونية وموصوفة بدقة وأن يكون البائع مالكاً للعنصر أو مخولاً ببيعه وأن تتوافق مع متطلبات بلد الإطلاق والدفع في السوق.'] },
      { heading: 'العناصر المحظورة والمقيدة', paragraphs: ['لا يجوز عرض العناصر التي يحظرها القانون أو المنتجات غير الآمنة أو المسروقة أو المقلدة أو الأسلحة المنظمة أو المخدرات المحظورة أو الخدمات غير القانونية أو الفئات الأخرى التي تحددها سياسة الإشراف النشطة.', 'قد تُحظر فئة بالكامل أو تُحال للمراجعة اليدوية، ولا يجوز للبائع التحايل على القيود بتغيير الصياغة أو الفئة أو الصور أو الحساب.'] },
      { heading: 'سلامة المنتجات', paragraphs: ['يتحمل البائع مسؤولية معايير سلامة المنتجات والتحذيرات الإلزامية والاستدعاءات والحظر المطبقة. وقد تزيل سوقنا عنصراً أو تقيده عند ظهور مخاوف تتعلق بالسلامة أو الامتثال.'] }
    ]}
  },
  safety: {
    slug: 'safety', ...candidateMeta,
    en: { title: 'Marketplace Safety Policy', summary: 'Candidate safety rules for marketplace interactions and fulfilment.', sections: [
      { heading: 'Stay on platform', paragraphs: ['Use Suqnaa messaging and protected transaction workflows where available. Do not share passwords, verification codes or unnecessary financial credentials with another user.'] },
      { heading: 'Pickup and delivery', paragraphs: ['Use the privacy-safe location and fulfilment tools. For in-person pickup, choose an appropriate public location where practical, verify the item before completing the handover, and do not proceed if circumstances feel unsafe.'] },
      { heading: 'Suspicious activity', paragraphs: ['Report suspected scams, impersonation, unsafe goods, threats or attempts to bypass protected payment. Suqnaa may preserve relevant evidence and route reports or risk signals for human review.'] }
    ]},
    ar: { title: 'سياسة سلامة السوق', summary: 'قواعد سلامة مرشحة للتعاملات والتنفيذ داخل السوق.', sections: [
      { heading: 'ابقَ داخل المنصة', paragraphs: ['استخدم مراسلة سوقنا ومسارات المعاملات المحمية حيثما كانت متاحة. لا تشارك كلمات المرور أو رموز التحقق أو بيانات مالية غير لازمة مع مستخدم آخر.'] },
      { heading: 'الاستلام والتوصيل', paragraphs: ['استخدم أدوات الموقع والتنفيذ المصممة لحماية الخصوصية. وعند الاستلام الشخصي اختر مكاناً عاماً مناسباً حيث يكون ذلك عملياً، وافحص العنصر قبل إتمام التسليم، ولا تتابع إذا بدت الظروف غير آمنة.'] },
      { heading: 'النشاط المريب', paragraphs: ['أبلغ عن الاحتيال المشتبه به أو انتحال الشخصية أو السلع غير الآمنة أو التهديدات أو محاولات تجاوز الدفع المحمي. وقد تحتفظ سوقنا بالأدلة ذات الصلة وتحيل البلاغات أو إشارات المخاطر للمراجعة البشرية.'] }
    ]}
  },
  payments: {
    slug: 'payments', ...candidateMeta,
    en: { title: 'Payments Policy', summary: 'Candidate payment policy for the Australia-only initial launch.', sections: [
      { heading: 'Launch boundary', paragraphs: ['Protected checkout is initially for eligible Australian marketplace transactions in AUD. Approved methods are provider-tokenised cards and eligible provider-tokenised wallets exposed by the approved payment flow.'] },
      { heading: 'Provider processing', paragraphs: ['Collection, regulated payment processing and seller payout infrastructure are operated through the approved payment provider. An internal “held” state records workflow status and provider evidence; it is not a representation that Suqnaa operates a stored-value or unlicensed escrow account.'] },
      { heading: 'Authorised money movement', paragraphs: ['Collection does not itself authorise seller release. Refunds, partial refunds, release, cancellation after payment, chargebacks and compliance holds use separately authorised workflows.'] }
    ]},
    ar: { title: 'سياسة المدفوعات', summary: 'سياسة دفع مرشحة للإطلاق الأولي داخل أستراليا فقط.', sections: [
      { heading: 'حدود الإطلاق', paragraphs: ['يقتصر الدفع المحمي في البداية على معاملات السوق الأسترالية المؤهلة بالدولار الأسترالي. والوسائل المعتمدة هي البطاقات المرمزة لدى المزود والمحافظ المؤهلة المرمزة لدى المزود التي يعرضها مسار الدفع المعتمد.'] },
      { heading: 'معالجة المزود', paragraphs: ['تتم عمليات التحصيل ومعالجة الدفع المنظمة وبنية تحويل مستحقات البائع عبر مزود الدفع المعتمد. وتعبر حالة «محتجز» الداخلية عن حالة سير العمل ودليل المزود ولا تعني أن سوقنا تدير رصيداً مخزناً أو حساب ضمان غير مرخص.'] },
      { heading: 'حركة الأموال المصرح بها', paragraphs: ['لا يجيز نجاح التحصيل وحده الإفراج للبائع. وتستخدم عمليات الاسترداد الكامل أو الجزئي والإفراج والإلغاء بعد الدفع ورد المبالغ الإجباري وحجوزات الامتثال مسارات منفصلة ذات صلاحيات محددة.'] }
    ]}
  },
  refunds: {
    slug: 'refunds', ...candidateMeta,
    en: { title: 'Refund Policy', summary: 'Candidate refund policy that preserves applicable statutory consumer rights.', sections: [
      { heading: 'Statutory rights', paragraphs: ['Nothing in this policy is intended to exclude a consumer guarantee or remedy that cannot lawfully be excluded. Business sellers remain responsible for remedies required in relation to their supply.'] },
      { heading: 'Platform workflow', paragraphs: ['Where supported, a buyer may use the dispute or protection workflow to request a refund or partial refund. Suqnaa may require relevant order, listing, message, fulfilment or return evidence before an authorised decision is made.'] },
      { heading: 'Change of mind', paragraphs: ['A change-of-mind refund is not automatically guaranteed by the platform unless the seller’s stated policy, an applicable Suqnaa protection rule, or law requires it.'] }
    ]},
    ar: { title: 'سياسة الاسترداد', summary: 'سياسة استرداد مرشحة تحافظ على حقوق المستهلك القانونية المطبقة.', sections: [
      { heading: 'الحقوق القانونية', paragraphs: ['لا يقصد بهذه السياسة استبعاد أي ضمان للمستهلك أو تعويض لا يجوز استبعاده قانوناً. ويظل البائع التجاري مسؤولاً عن التعويضات المطلوبة بشأن توريده.'] },
      { heading: 'مسار المنصة', paragraphs: ['حيثما كان ذلك مدعوماً يمكن للمشتري استخدام مسار النزاع أو الحماية لطلب استرداد كامل أو جزئي. وقد تطلب سوقنا أدلة ذات صلة بالطلب أو الإعلان أو الرسائل أو التنفيذ أو الإرجاع قبل اتخاذ قرار مخول.'] },
      { heading: 'تغيير الرأي', paragraphs: ['لا تضمن المنصة تلقائياً الاسترداد لمجرد تغيير الرأي ما لم تفرضه سياسة البائع المعلنة أو قاعدة حماية سوقنا المطبقة أو القانون.'] }
    ]}
  },
  disputes: {
    slug: 'disputes', ...candidateMeta,
    en: { title: 'Dispute Policy', summary: 'Candidate rules for buyer/seller dispute handling and appeals.', sections: [
      { heading: 'Opening a dispute', paragraphs: ['Eligible transaction participants may open a dispute using the protected marketplace workflow and should provide accurate, relevant evidence within the stated response deadlines.'] },
      { heading: 'Review and resolution', paragraphs: ['Operations reviewers may consider listing information, transaction records, communications, fulfilment evidence, return evidence and relevant provider records. Payment outcomes are executed only through separately authorised payment workflows.'] },
      { heading: 'Appeals', paragraphs: ['Where an appeal is available, it must be made within the stated window and should identify material facts or evidence that justify reconsideration. An appeal does not erase records required for audit, fraud, legal or accounting purposes.'] }
    ]},
    ar: { title: 'سياسة النزاعات', summary: 'قواعد مرشحة لمعالجة نزاعات المشتري والبائع والاستئناف.', sections: [
      { heading: 'فتح النزاع', paragraphs: ['يجوز لأطراف المعاملة المؤهلة فتح نزاع عبر مسار السوق المحمي، وينبغي تقديم أدلة صحيحة وذات صلة ضمن المهل المحددة للرد.'] },
      { heading: 'المراجعة والحل', paragraphs: ['قد ينظر مراجعو العمليات في معلومات الإعلان وسجلات المعاملة والمراسلات وأدلة التنفيذ والإرجاع وسجلات المزود ذات الصلة. ولا تُنفذ نتائج الدفع إلا عبر مسارات دفع منفصلة ذات صلاحيات محددة.'] },
      { heading: 'الاستئناف', paragraphs: ['عندما يكون الاستئناف متاحاً يجب تقديمه خلال المهلة المحددة مع بيان الوقائع أو الأدلة الجوهرية التي تبرر إعادة النظر. ولا يمحو الاستئناف السجلات اللازمة للتدقيق أو الاحتيال أو القانون أو المحاسبة.'] }
    ]}
  },
  returns: {
    slug: 'returns', ...candidateMeta,
    en: { title: 'Returns Policy', summary: 'Candidate policy for authorised returns and return evidence.', sections: [
      { heading: 'When a return may be required', paragraphs: ['A return may arise from an applicable statutory remedy, an agreed seller remedy, or an authorised Suqnaa buyer-protection/dispute outcome.'] },
      { heading: 'Return process', paragraphs: ['When a return is authorised, participants must follow the provided shipping or handover instructions and deadlines. Tracking, delivery and receipt records may be required to determine the return outcome.'] },
      { heading: 'Condition disputes', paragraphs: ['If the parties disagree about the returned item’s condition or receipt, the matter may be escalated for review with available evidence. A seller must not use a return policy to misrepresent or remove non-excludable consumer rights.'] }
    ]},
    ar: { title: 'سياسة الإرجاع', summary: 'سياسة مرشحة للإرجاعات المصرح بها وأدلة الإرجاع.', sections: [
      { heading: 'متى قد يلزم الإرجاع', paragraphs: ['قد ينشأ الإرجاع عن تعويض قانوني مطبق أو معالجة وافق عليها البائع أو نتيجة مخولة ضمن حماية المشتري أو النزاع في سوقنا.'] },
      { heading: 'مسار الإرجاع', paragraphs: ['عند التصريح بالإرجاع يجب على الأطراف اتباع تعليمات الشحن أو التسليم والمهل المقدمة. وقد تُطلب سجلات التتبع والتوصيل والاستلام لتحديد نتيجة الإرجاع.'] },
      { heading: 'نزاع حالة العنصر', paragraphs: ['إذا اختلف الطرفان بشأن حالة العنصر المرتجع أو استلامه فقد تُصعّد المسألة للمراجعة مع الأدلة المتاحة. ولا يجوز للبائع استخدام سياسة الإرجاع لتحريف أو إزالة حقوق مستهلك غير قابلة للاستبعاد.'] }
    ]}
  },
  'acceptable-use': {
    slug: 'acceptable-use', ...candidateMeta,
    en: { title: 'Acceptable Use Policy', summary: 'Candidate conduct rules for Suqnaa accounts and services.', sections: [
      { heading: 'Prohibited conduct', paragraphs: ['Do not use Suqnaa for fraud, deception, harassment, threats, unlawful discrimination, spam, malware, credential theft, payment evasion, manipulation of reviews or reputation, account farming, or attempts to bypass safety, moderation, rate-limit or payment controls.'] },
      { heading: 'Platform integrity', paragraphs: ['Do not probe, scrape or automate the service in a way that degrades availability, violates access controls, extracts non-public information, or interferes with another user’s use of the marketplace.'] },
      { heading: 'Enforcement', paragraphs: ['Suspected violations may be investigated using relevant marketplace and security records. Enforcement decisions remain subject to the applicable moderation, appeal and legal processes.'] }
    ]},
    ar: { title: 'سياسة الاستخدام المقبول', summary: 'قواعد سلوك مرشحة لحسابات وخدمات سوقنا.', sections: [
      { heading: 'السلوك المحظور', paragraphs: ['لا تستخدم سوقنا للاحتيال أو الخداع أو المضايقة أو التهديد أو التمييز غير القانوني أو الرسائل المزعجة أو البرمجيات الخبيثة أو سرقة بيانات الدخول أو التهرب من الدفع أو التلاعب بالمراجعات والسمعة أو إنشاء الحسابات بكثافة أو تجاوز ضوابط السلامة والإشراف والحدود والدفع.'] },
      { heading: 'سلامة المنصة', paragraphs: ['لا تفحص الخدمة أو تجمع بياناتها أو تؤتمتها بطريقة تضعف التوافر أو تتجاوز ضوابط الوصول أو تستخرج معلومات غير عامة أو تعطل استخدام شخص آخر للسوق.'] },
      { heading: 'التنفيذ', paragraphs: ['قد تُحقق المخالفات المشتبه بها باستخدام سجلات السوق والأمان ذات الصلة. وتظل قرارات التنفيذ خاضعة لمسارات الإشراف والاستئناف والقانون المطبقة.'] }
    ]}
  },
  contact: {
    slug: 'contact', ...candidateMeta,
    en: { title: 'Contact and Complaints', summary: 'Candidate contact pathways. Final stable legal and privacy contact details must be inserted during legal approval.', sections: [
      { heading: 'Marketplace support', paragraphs: ['Use the in-product support and dispute pathways for transaction-specific help where available. Do not send passwords, verification codes or full payment credentials in a support request.'] },
      { heading: 'Privacy and legal requests', paragraphs: ['The approved policy set must publish stable contact details for privacy access/correction requests, privacy complaints, legal notices and general complaints before public launch. Placeholder contact details must not be published as final contact channels.'] },
      { heading: 'Urgent safety', paragraphs: ['For immediate danger, contact the appropriate emergency service rather than relying on a marketplace support channel. Reports about unsafe listings, threats or fraud should also be submitted through the relevant Suqnaa reporting tools where safe to do so.'] }
    ]},
    ar: { title: 'الاتصال والشكاوى', summary: 'مسارات اتصال مرشحة. يجب إدخال بيانات اتصال قانونية وخصوصية ثابتة أثناء الاعتماد القانوني.', sections: [
      { heading: 'دعم السوق', paragraphs: ['استخدم مسارات الدعم والنزاعات داخل المنتج للمساعدة الخاصة بالمعاملات حيثما كانت متاحة. لا ترسل كلمات المرور أو رموز التحقق أو بيانات الدفع الكاملة في طلب دعم.'] },
      { heading: 'طلبات الخصوصية والقانون', paragraphs: ['يجب أن تنشر مجموعة السياسات المعتمدة بيانات اتصال ثابتة لطلبات الوصول أو التصحيح المتعلقة بالخصوصية وشكاوى الخصوصية والإشعارات القانونية والشكاوى العامة قبل الإطلاق العام. ولا يجوز نشر بيانات اتصال مؤقتة باعتبارها قنوات نهائية.'] },
      { heading: 'السلامة العاجلة', paragraphs: ['عند وجود خطر فوري اتصل بخدمة الطوارئ المناسبة بدلاً من الاعتماد على قناة دعم السوق. كما ينبغي الإبلاغ عن الإعلانات غير الآمنة أو التهديدات أو الاحتيال عبر أدوات الإبلاغ المناسبة في سوقنا عندما يكون ذلك آمناً.'] }
    ]}
  },
  'data-retention': {
    slug: 'data-retention', ...candidateMeta,
    en: { title: 'Data Retention Policy', summary: 'Candidate retention principles. Final periods require legal, tax, accounting, fraud and provider review.', sections: [
      { heading: 'Principle', paragraphs: ['Suqnaa should retain personal and marketplace records only for as long as they are reasonably needed for the purpose collected, a current operational need, dispute or fraud handling, accounting/audit, or an applicable legal requirement.'] },
      { heading: 'Bounded operational evidence', paragraphs: ['Risk event observations are designed for 30-day bounded retention. Moderation evidence snapshots are designed for 180-day retention and are not purged while an appeal remains open. These bounded copies do not automatically delete the authoritative source record where another valid retention purpose applies.'] },
      { heading: 'Transaction and compliance records', paragraphs: ['Orders, payment/provider references, settlement, dispute, tax, seller-verification and audit records may require longer retention. The final schedule must state approved periods after Australian legal, tax, accounting and provider requirements have been confirmed.'] },
      { heading: 'Deletion and de-identification', paragraphs: ['When information is no longer required and no law or valid operational purpose requires retention, Suqnaa should delete it or de-identify it as appropriate. Account closure does not necessarily erase records that must still be retained for another lawful purpose.'] }
    ]},
    ar: { title: 'سياسة الاحتفاظ بالبيانات', summary: 'مبادئ احتفاظ مرشحة. تتطلب الفترات النهائية مراجعة قانونية وضريبية ومحاسبية ومكافحة احتيال ومتطلبات المزود.', sections: [
      { heading: 'المبدأ', paragraphs: ['ينبغي أن تحتفظ سوقنا بالمعلومات الشخصية وسجلات السوق فقط للمدة المعقولة اللازمة للغرض الذي جُمعت من أجله أو لحاجة تشغيلية حالية أو لمعالجة نزاع أو احتيال أو للمحاسبة والتدقيق أو لمتطلب قانوني مطبق.'] },
      { heading: 'الأدلة التشغيلية محدودة المدة', paragraphs: ['صُممت ملاحظات أحداث المخاطر للاحتفاظ المحدود لمدة 30 يوماً. وصُممت لقطات أدلة الإشراف للاحتفاظ لمدة 180 يوماً ولا تُحذف أثناء بقاء استئناف مفتوح. ولا يؤدي حذف هذه النسخ المحدودة تلقائياً إلى حذف سجل المصدر الموثوق عندما يوجد غرض احتفاظ آخر صالح.'] },
      { heading: 'سجلات المعاملات والامتثال', paragraphs: ['قد تتطلب سجلات الطلبات ومراجع مزود الدفع والتسويات والنزاعات والضرائب والتحقق من البائع والتدقيق احتفاظاً أطول. ويجب أن يحدد الجدول النهائي الفترات المعتمدة بعد تأكيد المتطلبات القانونية والضريبية والمحاسبية ومتطلبات المزود في أستراليا.'] },
      { heading: 'الحذف ونزع الهوية', paragraphs: ['عندما تنتفي الحاجة إلى المعلومات ولا يفرض القانون أو غرض تشغيلي صالح الاحتفاظ بها، ينبغي حذفها أو نزع هويتها حسب الاقتضاء. ولا يعني إغلاق الحساب بالضرورة محو السجلات التي يجب استمرار الاحتفاظ بها لغرض قانوني آخر.'] }
    ]}
  }
};

export function isLegalPolicySlug(value: string): value is LegalPolicySlug {
  return legalPolicySlugs.includes(value as LegalPolicySlug);
}

export function legalPolicyFor(slug: LegalPolicySlug, locale: LegalPolicyLocale) {
  const policy = legalPolicies[slug];
  return { ...policy, content: policy[locale] };
}
