import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legalPolicies, legalPolicySlugs } from './legal-policy-content';
import { getPolicyPage, policySlugs } from './policy-pages';

const indexPage = readFileSync(new URL('../app/[locale]/legal/page.tsx', import.meta.url), 'utf8');
const detailPage = readFileSync(new URL('../app/[locale]/policy/[pageSlug]/page.tsx', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../components/site-footer.tsx', import.meta.url), 'utf8');

const required = [
  'terms', 'privacy', 'item-rules', 'safety', 'payments', 'refunds',
  'disputes', 'returns', 'acceptable-use', 'contact', 'data-retention'
] as const;

assert.deepEqual(legalPolicySlugs, required);
assert.ok(policySlugs.includes('items'), 'legacy /policy/items alias must remain available');
assert.equal(getPolicyPage('en', 'items')?.canonicalSlug, 'item-rules');
assert.equal(getPolicyPage('ar', 'items')?.canonicalSlug, 'item-rules');

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
    assert.equal(getPolicyPage(locale, slug)?.canonicalSlug, slug);
  }
}

assert.match(indexPage, /Legal & marketplace policies/);
assert.match(indexPage, /السياسات القانونية/);
assert.match(indexPage, /not yet effective/);
assert.match(indexPage, /لم تدخل حيز النفاذ بعد/);
assert.match(indexPage, /legalPolicySlugs\.map/);
assert.match(indexPage, /\/policy\/\$\{slug\}/);

assert.match(detailPage, /Legal-review candidate/);
assert.match(detailPage, /مرشح للمراجعة القانونية/);
assert.match(detailPage, /Pending legal approval/);
assert.match(detailPage, /بانتظار الاعتماد القانوني/);
assert.match(detailPage, /page\.effectiveDate \?\?/);
assert.match(detailPage, /alternates: \{ canonical:/);
assert.match(detailPage, /page\.canonicalSlug/);

for (const slug of required) {
  assert.ok(
    footer.includes('${policyBase}/' + slug),
    `footer must link to canonical /policy/${slug} surface`
  );
}
assert.match(footer, /Policy centre/);
assert.match(footer, /مركز السياسات/);

const approvedCandidates = Object.values(legalPolicies).filter((policy) => policy.reviewStatus === 'approved');
assert.equal(approvedCandidates.length, 0, 'candidate policies must not be marked approved before legal sign-off');

console.log('Bilingual legal policy candidate surface passed.');
