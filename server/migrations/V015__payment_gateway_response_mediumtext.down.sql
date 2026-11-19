-- Intentionally retain MEDIUMTEXT. Narrowing to VARCHAR(255) can truncate
-- provider payloads already stored after V015. This rollback is data-safe.
SELECT 'V015 rollback is intentionally a no-op to prevent data truncation' AS rollback_note;
