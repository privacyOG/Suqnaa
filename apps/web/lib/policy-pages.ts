import type { Locale } from '../i18n/locales';
import {
  legalPolicies,
  legalPolicySlugs,
  type LegalPolicyDocument,
  type LegalPolicySlug
} from './legal-policy-content';

export const policySlugs = [...legalPolicySlugs, 'items'] as const;
export type PolicySlug = (typeof policySlugs)[number];

export type PolicyPage = {
  slug: LegalPolicySlug;
  title: string;
  summary: string;
  sections: Array<{ title: string; body: string }>;
  version: string;
  reviewStatus: LegalPolicyDocument['reviewStatus'];
  effectiveDate: string | null;
  lastUpdated: string;
  canonicalSlug: LegalPolicySlug;
};

function canonicalPolicySlug(slug: string): LegalPolicySlug | null {
  const normalized = slug === 'items' ? 'item-rules' : slug;
  return legalPolicySlugs.includes(normalized as LegalPolicySlug)
    ? normalized as LegalPolicySlug
    : null;
}

export function getPolicyPage(locale: Locale, slug: string): PolicyPage | null {
  const canonicalSlug = canonicalPolicySlug(slug);
  if (!canonicalSlug) return null;

  const policy = legalPolicies[canonicalSlug];
  const content = policy[locale];
  return {
    slug: canonicalSlug,
    canonicalSlug,
    title: content.title,
    summary: content.summary,
    sections: content.sections.map((section) => ({
      title: section.heading,
      body: section.paragraphs.join('\n\n')
    })),
    version: policy.version,
    reviewStatus: policy.reviewStatus,
    effectiveDate: policy.effectiveDate,
    lastUpdated: policy.lastUpdated
  };
}
