# Phone identity handling

Phone identities are stored and compared only in E.164 form.

## Canonical format

The API accepts an explicit international number beginning with `+`, or the international `00` prefix, and canonicalizes safe presentation formatting before authentication, uniqueness checks, recovery lookup, verification, rate limiting, or persistence.

Examples that resolve to the same identity:

- `+61 412 345 678`
- `0061 (412) 345-678`
- `+٦١ ٤١٢ ٣٤٥ ٦٧٨`
- `+۶۱ ۴۱۲ ۳۴۵ ۶۷۸`

All become:

```text
+61412345678
```

The canonical value must contain `+`, a non-zero country-code first digit, and 8 to 15 digits in total after `+`.

Local-only numbers such as `0412345678` are rejected. The server never guesses a country because doing so could merge unrelated identities or bind an account to the wrong phone number.

## Account flows

Registration and sign-in accept either email or phone. Phone-only registrations create the same pending account/session used by email registrations and then continue to contact verification. Phone sign-in performs lookup only after canonical normalization.

Password recovery also accepts either email or phone. Phone recovery uses the same enumeration-safe public response, reset-token ledger, expiry, durable issuance limits, single-use consumption, and all-session revocation as email recovery. The account-security delivery relay receives `channel: phone` and the canonical E.164 destination.

## Database enforcement and upgrades

Migration `014_phone_e164.sql` canonicalizes safely transformable stored values by removing presentation separators, converting Arabic/Eastern-Arabic digits, and translating an international `00` prefix to `+`.

The migration then validates every non-null stored phone identity. If any value still cannot be represented safely as E.164, the migration fails with an explicit remediation error. It does not infer a country, delete the number, or silently modify an ambiguous local number.

After validation, PostgreSQL enforces the E.164 shape with the `users_phone_e164_format` check constraint in addition to the existing uniqueness constraint.
