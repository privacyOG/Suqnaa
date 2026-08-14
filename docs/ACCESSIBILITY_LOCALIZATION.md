# Accessibility and localisation QA

P1-13 establishes the cross-platform accessibility, keyboard, responsive-layout, RTL, Arabic typography, and English/Arabic localisation baseline for Suqnaa.

## Web keyboard and focus contract

All keyboard-focusable controls must expose a clearly visible focus indicator. `apps/web/app/accessibility.css` provides a high-contrast `:focus-visible` outline for links, buttons, form fields, summaries, and explicit interactive roles without relying on hover state.

Localized routes expose a keyboard skip link before application content. English uses `Skip to main content`; Arabic uses `انتقل إلى المحتوى الرئيسي`. The target is programmatically focusable so keyboard and assistive-technology users can bypass repeated navigation.

Buttons and form fields retain a minimum 44 CSS-pixel block target. Native semantic elements remain preferred over click handlers on non-interactive elements.

## Motion and contrast

The web application honors `prefers-reduced-motion: reduce` by disabling non-essential animation, transition, and smooth-scroll motion. A `prefers-contrast: more` rule strengthens control borders for users requesting increased contrast.

Product colors must never be the sole carrier of meaning. Status, validation, payment, moderation, fulfilment, and safety states require textual or semantic labels in addition to color.

## Responsive layouts and text scaling

Web layouts must remain usable with browser zoom and user font enlargement. Narrow screens use logical inline padding and wrapping rather than fixed left/right assumptions.

The Flutter application does not clamp `MediaQuery.textScaler`; operating-system text scaling therefore remains authoritative. Material controls use padded tap targets and standard visual density so accessibility target sizing is preserved.

Manual QA must include:

- web at 200% browser zoom and narrow mobile widths;
- Android and iOS with increased system text size;
- long English and Arabic strings without clipped critical actions;
- landscape/narrow-width checks on forms, listing cards, messaging, orders, and account screens.

## Screen-reader and semantic expectations

Meaningful public images require alternative text or an equivalent semantic label. Decorative imagery should be excluded from the accessibility tree.

Icon-only controls require a visible or assistive label (`aria-label`, accessible name, or Flutter `tooltip`/`Semantics`). Progress/loading state that materially blocks interaction should be announced without repeatedly flooding the live region.

The mobile session-restoration gate exposes one live-region semantic announcement and excludes duplicate child semantics while retaining visible localized text.

## RTL and Arabic typography

Localized web content sets both `lang` and `dir` at the locale boundary. CSS uses logical properties (`inset-inline-*`, `padding-inline`, `text-align: start`) for direction-sensitive behavior.

Arabic routes use an Arabic-capable font fallback stack and increased line height. Do not apply Latin-focused negative letter spacing or uppercase transformations to Arabic copy.

Manual RTL review must cover navigation, search/filter controls, forms, dialogs, image galleries, messages, order timelines, account/security flows, and validation/error placement.

## EN/AR localisation contract

`scripts/validate-accessibility-localization.mjs` enforces:

- exact public-key parity between Flutter English and Arabic ARB catalogues;
- non-empty values in both catalogues;
- matching interpolation placeholders for every translated message;
- structural key parity between the web English and Arabic message objects;
- a predominantly Arabic-script Arabic mobile catalogue;
- presence of the web keyboard/focus/reduced-motion/RTL accessibility baseline.

Any new user-visible message should be added to English and Arabic in the same change. Secrets, identifiers, prices, codes, URLs, and other machine values must not be translated accidentally.

## Manual release QA matrix

Repository checks are necessary but not sufficient for P1-13 completion. Before final certification, exercise the major customer journeys with:

1. keyboard-only web navigation, including visible focus order and skip navigation;
2. a desktop screen reader on English and Arabic routes;
3. TalkBack on Android and VoiceOver on iOS for catalogue, listing detail, sell/edit, messages, offer/order, fulfilment, account/security, and deletion flows;
4. 200% web zoom and enlarged mobile system text;
5. English LTR and Arabic RTL at common phone, tablet, and desktop widths;
6. reduced-motion preference enabled;
7. validation/error states, loading states, disabled controls, and destructive confirmations.

Record any release-blocking defect before marking P1-13 complete. P1-13 is not complete merely because static validation passes.