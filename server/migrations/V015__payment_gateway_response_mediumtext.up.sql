-- Preserve complete gateway payloads; Paystack responses may exceed VARCHAR(255).
ALTER TABLE payment_transactions
  MODIFY COLUMN gateway_response MEDIUMTEXT NULL;
