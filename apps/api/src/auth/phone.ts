const e164Pattern = /^\+[1-9][0-9]{7,14}$/;
const removableFormatting = /[\s().-]+/g;
const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
const easternArabicDigits = '۰۱۲۳۴۵۶۷۸۹';

export class PhoneNormalizationError extends Error {
  constructor(message = 'Phone number must use international E.164 format') {
    super(message);
    this.name = 'PhoneNormalizationError';
  }
}

function asciiDigits(value: string): string {
  return Array.from(value, (character) => {
    const arabicIndex = arabicIndicDigits.indexOf(character);
    if (arabicIndex >= 0) return String(arabicIndex);
    const easternIndex = easternArabicDigits.indexOf(character);
    if (easternIndex >= 0) return String(easternIndex);
    return character;
  }).join('');
}

export function normalizePhoneE164(input: string): string {
  let compact = asciiDigits(input.trim()).replace(removableFormatting, '');

  if (compact.startsWith('00')) {
    compact = `+${compact.slice(2)}`;
  }

  if (!e164Pattern.test(compact)) {
    throw new PhoneNormalizationError();
  }

  return compact;
}

export function isPhoneE164(input: string): boolean {
  return e164Pattern.test(input);
}
