import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legalPolicies, legalPolicySlugs } from './legal-policy-content';

const indexPage = readFileSync(new URL('../app/[locale]/legal/page.tsx', import.meta.url), 'utf8');
const detailPage = readFileSync(new URL('../app/[locale]/legal/[policy]/page.tsx', import.meta.url), 'utf8');

const required = [
  'terms', 'privacy', 'item-rules', 'safety', 'payments', 'refunds',
  'disputes', 'returns', 'acceptable-use', 'contact', 'data-retention'
] as const;

assert.deepEqual(legalPolicySlugs, required);
for (const slug of required) {
  const policy = legalPolicies[slug];
  assert.equal(policy.slug, slug);
  assert.match(policy.version, /^2026-08-candidate-/);
  assert.equal(policy.reviewStatus, 'pending_legal_review');
  assert.equal(policy.effectiveDate, null);
  assert.match(policy.lastUpdated, /^2026-08-\d{2}$/);

  for (const locale of ['en', 'ar'] as const) {
    const content = policy[locale];
    assert.ok(content.title.trim().length >= 3, `${slug}/${locale} title`);
    assert.ok(content.summary.trim().length >= 20, `${slug}/${locale} summary`);
    assert.ok(content.sections.length >= 3, `${slug}/${locale} sections`);
    for (const section of content.sections) {
      assert.ok(section.heading.trim().length >= 3, `${slug}/${locale} heading`);
      assert.ok(section.paragraphs.length >= 1, `${slug}/${locale} paragraphs`);
      assert.ok(section.paragraphs.every((paragraph) => paragraph.trim().length >= 20));
    }
  }
}

assert.match(indexPage, /Legal & marketplace policies/);
assert.match(indexPage, /السياسات القانونية/);
assert.match(indexPage, /not yet effective/);
assert.match(indexPage, /لم تدخل حيز النفاذ بعد/);
assert.match(indexPage, /legalPolicySlugs\.map/);
assert.match(detailPage, /Legal-review candidate/);
assert.match(detailPage, /مرشح للمراجعة القانونية/);
assert.match(detailPage, /pending legal approval/);
assert.match(detailPage, /بانتظار الاعتماد القانوني/);
assert.match(detailPage, /policy\.effectiveDate \?\?/);
assert.match(detailPage, /dir=\{ar \? 'rtl' : 'ltr'\}/);

const approvedCandidates = Object.values(legalPolicies).filter((policy) => policy.reviewStatus === 'approved');
assert.equal(approvedCandidates.length, 0, 'candidate policies must not be marked approved before legal sign-off');

console.log('Bilingual legal policy candidate surface passed.');
