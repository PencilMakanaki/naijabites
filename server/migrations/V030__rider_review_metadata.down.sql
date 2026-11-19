ALTER TABLE rider_profiles
  DROP FOREIGN KEY fk_rider_profiles_reviewer,
  DROP INDEX ix_rider_profiles_reviewed_at,
  DROP COLUMN reviewed_at,
  DROP COLUMN reviewed_by,
  DROP COLUMN review_reason;
