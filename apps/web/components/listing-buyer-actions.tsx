'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthedRequestError } from '../lib/authed-api';
import { createConversationEntry } from '../lib/conversation-actions';
import {
  getChallengeConfiguration,
  type ChallengeConfiguration
} from '../lib/challenge-api';
import { submitListingOffer } from '../lib/trading-api';
import { ChallengeProviderScript } from './challenge-provider-script';
import { ChallengeWidget } from './challenge-widget';

export interface ListingBuyerActionsProps {
  locale: string;
  listingId: string;
  sellerId: string;
  sellerName: string;
  priceAmount: string | number;
  currencyCode: string;
}

function requestFailure(caught: unknown, isArabic: boolean, action: 'message' | 'offer'): string {
  if (caught instanceof AuthedRequestError) {
    if (caught.status === 401) {
      return isArabic
        ? 'انتهت جلسة الحساب. سجّل الدخول ثم أعد المحاولة.'
        : 'Your account session ended. Sign in and try again.';
    }
    if (caught.status === 409 && action === 'offer') {
      return isArabic
        ? 'لديك عرض معلّق بالفعل لهذا الإعلان.'
        : 'You already have a pending offer for this listing.';
    }
    if (caught.status === 429) {
      return isArabic
        ? `محاولات كثيرة. انتظر${caught.retryAfter ? ` ${caught.retryAfter} ثانية` : ''}.`
        : `Too many attempts. Wait${caught.retryAfter ? ` ${caught.retryAfter} seconds` : ''}.`;
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
      return action === 'offer'
        ? (isArabic
            ? 'تحقق من قيمة العرض وعملته.'
            : 'Check the offer amount and currency.')
        : (isArabic
            ? 'تحقق من نص الرسالة.'
            : 'Check the message text.');
    }
  }

  return action === 'offer'
    ? (isArabic ? 'تعذر إرسال العرض حالياً.' : 'The offer could not be submitted right now.')
    : (isArabic ? 'تعذر إرسال الرسالة حالياً.' : 'The message could not be sent right now.');
}

function displayAmount(amount: string | number, currencyCode: string, locale: string): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return `${amount} ${currencyCode}`;
  }

  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-AU' : 'en-AU', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currencyCode}`;
  }
}

export function ListingBuyerActions({
  locale,
  listingId,
  sellerId,
  sellerName,
  priceAmount,
  currencyCode
}: ListingBuyerActionsProps) {
  const isArabic = locale === 'ar';
  const askingAmount = Number(priceAmount);
  const [configuration, setConfiguration] = useState<ChallengeConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const [messageToken, setMessageToken] = useState<string | null>(null);
  const [offerToken, setOfferToken] = useState<string | null>(null);
  const [messageResetKey, setMessageResetKey] = useState(0);
  const [offerResetKey, setOfferResetKey] = useState(0);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSuccess, setOfferSuccess] = useState<string | null>(null);

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
  const messageAction = configuration?.actions.messageCreate;
  const offerAction = configuration?.actions.offerCreate;
  const messageReady = !challengeEnabled || Boolean(siteKey && messageAction && messageToken);
  const offerReady = !challengeEnabled || Boolean(siteKey && offerAction && offerToken);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration || configurationError || !messageReady || sendingMessage) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get('body') ?? '').trim();
    if (!body || body.length > 2000) {
      setMessageError(
        isArabic
          ? 'اكتب رسالة بين حرف واحد و2000 حرف.'
          : 'Enter a message between 1 and 2,000 characters.'
      );
      return;
    }

    setSendingMessage(true);
    setMessageError(null);

    try {
      const response = await createConversationEntry(
        {
          recipientId: sellerId,
          listingId,
          body,
          clientMessageId: globalThis.crypto.randomUUID()
        },
        messageToken ?? undefined
      );
      window.location.assign(`/${locale}/messages/${response.message.conversationId}`);
    } catch (caught) {
      setMessageError(requestFailure(caught, isArabic, 'message'));
    } finally {
      if (challengeEnabled) {
        setMessageToken(null);
        setMessageResetKey((value) => value + 1);
      }
      setSendingMessage(false);
    }
  }

  async function sendOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration || configurationError || !offerReady || sendingOffer) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(form.get('amount'));
    const note = String(form.get('message') ?? '').trim();

    if (!Number.isFinite(amount) || amount <= 0 || (Number.isFinite(askingAmount) && amount > askingAmount)) {
      setOfferError(
        isArabic
          ? 'أدخل عرضاً أكبر من صفر ولا يتجاوز السعر المطلوب.'
          : 'Enter an offer above zero that does not exceed the asking price.'
      );
      return;
    }

    setSendingOffer(true);
    setOfferError(null);
    setOfferSuccess(null);

    try {
      const response = await submitListingOffer(
        {
          listingId,
          amount,
          currencyCode,
          message: note || undefined,
          clientOfferId: globalThis.crypto.randomUUID()
        },
        offerToken ?? undefined
      );
      setOfferSuccess(
        isArabic
          ? `تم إرسال عرضك بقيمة ${displayAmount(response.offer.amount, response.offer.currencyCode, locale)}.`
          : `Your ${displayAmount(response.offer.amount, response.offer.currencyCode, locale)} offer was submitted.`
      );
      formElement.reset();
    } catch (caught) {
      setOfferError(requestFailure(caught, isArabic, 'offer'));
    } finally {
      if (challengeEnabled) {
        setOfferToken(null);
        setOfferResetKey((value) => value + 1);
      }
      setSendingOffer(false);
    }
  }

  return (
    <div className="buyer-actions-grid">
      {challengeEnabled ? <ChallengeProviderScript /> : null}

      <section className="buyer-action-card">
        <div>
          <span className="buyer-action-label">{isArabic ? 'تواصل' : 'Contact'}</span>
          <h2>{isArabic ? `راسل ${sellerName}` : `Message ${sellerName}`}</h2>
          <p>
            {isArabic
              ? 'اسأل عن الحالة أو الاستلام أو التوصيل. لا ترسل معلومات دفع حساسة.'
              : 'Ask about condition, pickup, or delivery. Do not send sensitive payment information.'}
          </p>
        </div>

        <form className="buyer-action-form" onSubmit={sendMessage}>
          <label>
            {isArabic ? 'رسالتك' : 'Your message'}
            <textarea
              name="body"
              minLength={1}
              maxLength={2000}
              rows={4}
              required
              placeholder={isArabic ? 'مرحباً، هل المنتج ما زال متاحاً؟' : 'Hi, is this item still available?'}
            />
          </label>

          {challengeEnabled && siteKey && messageAction ? (
            <ChallengeWidget
              siteKey={siteKey}
              action={messageAction}
              locale={locale}
              resetKey={messageResetKey}
              onToken={setMessageToken}
              onExpired={() => setMessageToken(null)}
              onError={() => {
                setMessageToken(null);
                setMessageError(
                  isArabic
                    ? 'تعذر إكمال الفحص الأمني.'
                    : 'The security check could not be completed.'
                );
              }}
            />
          ) : null}

          {messageError ? <p className="auth-error" role="alert">{messageError}</p> : null}

          <button
            className="button-primary"
            type="submit"
            disabled={!configuration || configurationError || !messageReady || sendingMessage}
          >
            {sendingMessage
              ? (isArabic ? 'جارٍ الإرسال…' : 'Sending…')
              : (isArabic ? 'إرسال رسالة' : 'Send message')}
          </button>
        </form>
      </section>

      <section className="buyer-action-card offer-card">
        <div>
          <span className="buyer-action-label">{isArabic ? 'تفاوض' : 'Negotiate'}</span>
          <h2>{isArabic ? 'قدّم عرضاً' : 'Make an offer'}</h2>
          <p>
            {isArabic
              ? `السعر المطلوب ${displayAmount(priceAmount, currencyCode, locale)}. يمكن أن يكون العرض مساوياً له أو أقل.`
              : `The asking price is ${displayAmount(priceAmount, currencyCode, locale)}. Your offer may be equal to or below it.`}
          </p>
        </div>

        <form className="buyer-action-form" onSubmit={sendOffer}>
          <label>
            {isArabic ? 'قيمة العرض' : 'Offer amount'}
            <div className="amount-field">
              <input
                name="amount"
                type="number"
                min="0.01"
                max={Number.isFinite(askingAmount) ? askingAmount : undefined}
                step="0.01"
                required
                placeholder="0.00"
              />
              <span>{currencyCode}</span>
            </div>
          </label>

          <label>
            {isArabic ? 'ملاحظة اختيارية' : 'Optional note'}
            <textarea
              name="message"
              maxLength={500}
              rows={3}
              placeholder={isArabic ? 'أضف سبباً مختصراً للعرض' : 'Add a brief note for the seller'}
            />
          </label>

          {challengeEnabled && siteKey && offerAction ? (
            <ChallengeWidget
              siteKey={siteKey}
              action={offerAction}
              locale={locale}
              resetKey={offerResetKey}
              onToken={setOfferToken}
              onExpired={() => setOfferToken(null)}
              onError={() => {
                setOfferToken(null);
                setOfferError(
                  isArabic
                    ? 'تعذر إكمال الفحص الأمني.'
                    : 'The security check could not be completed.'
                );
              }}
            />
          ) : null}

          {offerError ? <p className="auth-error" role="alert">{offerError}</p> : null}
          {offerSuccess ? <p className="offer-success" role="status">{offerSuccess}</p> : null}

          <button
            className="button-primary"
            type="submit"
            disabled={!configuration || configurationError || !offerReady || sendingOffer}
          >
            {sendingOffer
              ? (isArabic ? 'جارٍ الإرسال…' : 'Submitting…')
              : (isArabic ? 'إرسال العرض' : 'Submit offer')}
          </button>
        </form>
      </section>

      {configurationError ? (
        <p className="auth-error buyer-actions-error" role="alert">
          {isArabic
            ? 'تعذر تحميل إعدادات الأمان. إجراءات المشتري متوقفة مؤقتاً.'
            : 'Security settings could not be loaded. Buyer actions are temporarily unavailable.'}
        </p>
      ) : null}
    </div>
  );
}
