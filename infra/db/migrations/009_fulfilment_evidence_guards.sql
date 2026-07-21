ALTER TABLE fulfilments
  ADD CONSTRAINT fulfilments_shipped_evidence_check
  CHECK (
    status <> 'shipped' OR
    (
      shipped_at IS NOT NULL AND
      carrier IS NOT NULL AND
      length(btrim(carrier)) BETWEEN 2 AND 80 AND
      tracking_reference IS NOT NULL AND
      length(btrim(tracking_reference)) BETWEEN 3 AND 160
    )
  ) NOT VALID;

ALTER TABLE fulfilments
  ADD CONSTRAINT fulfilments_delivered_timestamp_check
  CHECK (
    status <> 'delivered' OR delivered_at IS NOT NULL
  ) NOT VALID;

ALTER TABLE fulfilments
  ADD CONSTRAINT fulfilments_buyer_confirmation_check
  CHECK (
    status <> 'received_confirmed' OR buyer_confirmed_at IS NOT NULL
  ) NOT VALID;
