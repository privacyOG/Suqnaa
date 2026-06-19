# Localisation and Arabic support

Suqnaa must support English and Arabic from the start, then expand to more languages without changing core product logic.

## Principles

- Arabic is a first-class language, not a simple afterthought.
- Arabic screens must use right-to-left layout.
- Arabic copy should be written naturally for marketplace users, not translated word-for-word from English.
- Dates, numbers, currencies, and sorting must respect the selected locale.
- Search should support Arabic and English category names.
- Brand text remains `Suqnaa` and `سوقنا`.

## Initial locales

- `en`: English
- `ar`: Arabic

Future candidates:

- `fr`: French for North Africa.
- `tr`: Turkish.
- `ur`: Urdu.
- `hi`: Hindi.
- `id`: Indonesian.
- `ms`: Malay.

## Arabic copy style

Use clear, modern Arabic suitable for MENA users. Avoid overly literal phrasing. Prefer concise marketplace language such as:

- اكتشف
- تواصل
- ثق
- صفقات موثوقة
- بائعون موثقون
- أسعار عادلة
- سوقك بين يديك

## Web implementation

The Next.js app uses locale routes such as `/en` and `/ar`. The `dir` attribute is set from the locale so Arabic renders right-to-left.

## Mobile implementation

Flutter uses locale-aware app configuration with Arabic as a supported locale. The app should use Arabic strings from a single localisation source and must not hard-code user-facing copy inside widgets once the screen moves beyond prototype status.

## Assistant capability

The assistant feature must also be localisation-aware. It should understand the selected language and return answers in the same language unless the user requests otherwise. The assistant must be provider-agnostic so the backend can change providers or run a self-hosted model without changing the app interface.
