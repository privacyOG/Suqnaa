import { ar } from './messages/ar';
import { en } from './messages/en';
import type { Locale } from './locales';

export function getMessages(locale: Locale) {
  return locale === 'ar' ? ar : en;
}
