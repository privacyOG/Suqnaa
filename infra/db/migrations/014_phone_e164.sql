WITH normalized AS (
  SELECT
    id,
    regexp_replace(
      translate(
        phone_e164,
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[[:space:]().-]',
      '',
      'g'
    ) AS compact
  FROM users
  WHERE phone_e164 IS NOT NULL
)
UPDATE users AS target
SET phone_e164 = CASE
  WHEN normalized.compact LIKE '00%' THEN '+' || substring(normalized.compact FROM 3)
  ELSE normalized.compact
END
FROM normalized
WHERE target.id = normalized.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    WHERE phone_e164 IS NOT NULL
      AND phone_e164 !~ '^\+[1-9][0-9]{7,14}$'
  ) THEN
    RAISE EXCEPTION 'Existing phone identities must be corrected to E.164 before this migration can complete';
  END IF;
END
$$;

ALTER TABLE users
  ADD CONSTRAINT users_phone_e164_format
  CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
