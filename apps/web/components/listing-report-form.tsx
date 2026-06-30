'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { submitReport, type ReportReason } from '../lib/report-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export interface ListingReportFormProps {
  locale: string;
  listingId: string;
  reportedUserId: string;
  sellerName: string;
}

const reportReasons: ReportReason[] = [
  'prohibited_item',
  'scam',
  'counterfeit',
  'harassment',
  'spam',
  'wrong_category',
  'unsafe',
  'other'
];

const reasonLabels: Record<ReportReason, [string, string]> = {
  prohibited_item: ['Prohibited or illegal item', 'منتج محظور أو غير قانوني'],
  scam: ['Scam or suspicious behaviour', 'احتيال أو سلوك مريب'],
  counterfeit: ['Counterfeit or misleading item', 'منتج مقلد أو مضلل'],
  harassment: ['Harassment or abuse', 'مضايقة أو إساءة'],
  spam: ['Spam or repeated content', 'رسائل مزعجة أو محتوى متكرر'],
  wrong_category: ['Wrong category or misleading details', 'تصنيف خاطئ أو تفاصيل مضللة'],
  unsafe: ['Unsafe item or unsafe meetup request', 'منتج غير آمن أو طلب مقابلة غير آمن'],
  other: ['Other safety concern', 'مشكلة أمان أخرى']
};

function reportFailure(caught: unknown, isArabic: boolean): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic
        ? 'انتهت جلسة الحساب. سجّل الدخول ثم أعد المحاولة.'
        : 'Your account session ended. Sign in and try again.';
    }
    if (caught.status === 409) {
      return isArabic
        ? 'لا يمكنك الإبلاغ عن إعلانك أو حسابك.'
        : 'You cannot report your own listing or account.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `محاولات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many report attempts. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
    }
    if (caught.payload.requiresHumanCheck || caught.status === 403) {
      return isArabic
        ? 'تعذر التحقق من الفحص الأمني. أكمله مرة أخرى.'
        : 'The security check could not be verified. Complete it again.';
    }
    if (caught.status === 404) {
      return isArabic
        ? 'لم يعد الإعلان أو البائع متاحاً.'
        : 'The listing or seller is no longer available.';
    }
    if (caught.status === 400) {
      return isArabic
        ? 'تحقق من سبب البلاغ والتفاصيل.'
        : 'Check the report reason and details.';
    }
  }

  return isArabic
    ? 'تعذر إرسال البلاغ حالياً.'
    : 'The report could not be submitted right now.';
}

export function ListingReportForm({
  locale,
  listingId,
  reportedUserId,
  sellerName
}: ListingReportFormProps) {
  const isArabic = locale === 'ar';
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [reportToken, setReportToken] = useState<string | null>(null);
  const [reportResetKey, setReportResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getChallengeConfiguration()
      .then((value) => {
        if (active) {
          setConfiguration(value);
        }
      })
      .catch(() => {
        if (active) {
          setConfigurationError(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const challengeEnabled = configuration?.enabled === true;
  const siteKey = configuration?.siteKey ?? null;
  const reportAction = configuration?.actions.reportCreate;
  const reportReady = !challengeEnabled || Boolean(siteKey && reportAction && reportToken);

  async function sendReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration || configurationError || !reportReady || submitting) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const reason = String(form.get('reason') ?? '') as ReportReason;
    const details = String(form.get('details') ?? '').trim();

    if (!reportReasons.includes(reason)) {
      setError(isArabic ? 'اختر سبب البلاغ.' : 'Choose a report reason.');
      return;
    }
    if (details.length > 1200) {
      setError(isArabic ? 'اجعل التفاصيل أقل من 1200 حرف.' : 'Keep details under 1,200 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await submitReport(
        {
          listingId,
          reportedUserId,
          reason,
          details: details || undefined
        },
        reportToken ?? undefined
      );
      setSuccess(
        response.report.status === 'already_reported'
          ? (isArabic
              ? 'تم تسجيل بلاغ سابق لهذا الإعلان ولم تتم مراجعته بعد.'
              : 'You already have an unresolved report for this listing.')
          : (isArabic
              ? 'تم إرسال البلاغ. سيقوم فريق سوقنا بمراجعته.'
              : 'Report submitted. The Suqnaa team will review it.')
      );
      formElement.reset();
    } catch (caught) {
      setError(reportFailure(caught, isArabic));
    } finally {
      if (challengeEnabled) {
        setReportToken(null);
        setReportResetKey((value) => value + 1);
      }
      setSubmitting(false);
    }
  }

  return (
    <section className="buyer-action-card report-listing-card">
      {challengeEnabled ? <ChallengeProviderScript /> : null}
      <div>
        <span className="buyer-action-label">{isArabic ? 'بلاغ' : 'Report'}</span>
        <h2>{isArabic ? 'أبلغ عن مشكلة' : 'Report a problem'}</h2>
        <p>
          {isArabic
            ? `أبلغ فريق سوقنا عن إعلان أو سلوك غير آمن من ${sellerName}. البلاغات لا تظهر للبائع.`
            : `Tell Suqnaa about unsafe listings or behaviour from ${sellerName}. Reports are not shown to the seller.`}
        </p>
      </div>

      <form className="buyer-action-form" onSubmit={sendReport}>
        <label>
          {isArabic ? 'سبب البلاغ' : 'Reason'}
          <select name="reason" defaultValue="" required>
            <option value="" disabled>
              {isArabic ? 'اختر السبب' : 'Choose a reason'}
            </option>
            {reportReasons.map((reason) => (
              <option key={reason} value={reason}>
                {reasonLabels[reason][isArabic ? 1 : 0]}
              </option>
            ))}
          </select>
        </label>

        <label>
          {isArabic ? 'تفاصيل اختيارية' : 'Optional details'}
          <textarea
            name="details"
            maxLength={1200}
            rows={4}
            placeholder={isArabic
              ? 'أضف ما يساعد فريق المراجعة بدون مشاركة كلمات مرور أو رموز تحقق.'
              : 'Add anything useful for review. Do not include passwords or verification codes.'}
          />
        </label>

        {challengeEnabled && siteKey && reportAction ? (
          <ChallengeWidget
            siteKey={siteKey}
            action={reportAction}
            locale={locale}
            resetKey={reportResetKey}
            onToken={setReportToken}
            onExpired={() => setReportToken(null)}
            onError={() => {
              setReportToken(null);
              setError(
                isArabic
                  ? 'تعذر إكمال الفحص الأمني.'
                  : 'The security check could not be completed.'
              );
            }}
          />
        ) : null}

        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {success ? <p className="offer-success" role="status">{success}</p> : null}

        <button
          className="button-secondary"
          type="submit"
          disabled={!configuration || configurationError || !reportReady || submitting}
        >
          {submitting
            ? (isArabic ? 'جارٍ الإرسال…' : 'Submitting…')
            : (isArabic ? 'إرسال البلاغ' : 'Submit report')}
        </button>
      </form>

      {configurationError ? (
        <p className="auth-error" role="alert">
          {isArabic
            ? 'تعذر تحميل إعدادات الأمان. البلاغات متوقفة مؤقتاً.'
            : 'Security settings could not be loaded. Reports are temporarily unavailable.'}
        </p>
      ) : null}
    </section>
  );
}
