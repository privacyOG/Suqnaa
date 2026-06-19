import { env } from '../config/env.js';

export type AssistantPurpose = 'listing_draft' | 'buyer_help' | 'safety_help';
export type AssistantLocale = 'en' | 'ar';

export interface AssistantRequest {
  locale: AssistantLocale;
  purpose: AssistantPurpose;
  message: string;
}

export interface AssistantResponse {
  enabled: boolean;
  locale: AssistantLocale;
  purpose: AssistantPurpose;
  answer: string;
}

const fallback: Record<AssistantLocale, string> = {
  en: 'The marketplace assistant is not enabled yet. This request was received and can be connected to a provider later.',
  ar: 'مساعد السوق غير مفعّل حالياً. تم استلام الطلب ويمكن ربطه بمزوّد لاحقاً.'
};

export async function runAssistant(request: AssistantRequest): Promise<AssistantResponse> {
  if (!env.ASSISTANT_ENABLED || env.ASSISTANT_PROVIDER === 'none') {
    return {
      enabled: false,
      locale: request.locale,
      purpose: request.purpose,
      answer: fallback[request.locale]
    };
  }

  return {
    enabled: true,
    locale: request.locale,
    purpose: request.purpose,
    answer: fallback[request.locale]
  };
}
