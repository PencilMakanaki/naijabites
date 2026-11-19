ALTER TABLE rider_profiles
  ADD COLUMN review_reason VARCHAR(500) NULL AFTER status,
  ADD COLUMN reviewed_by BIGINT UNSIGNED NULL AFTER approved_at,
  ADD COLUMN reviewed_at DATETIME(3) NULL AFTER reviewed_by,
  ADD CONSTRAINT fk_rider_profiles_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT,
  ADD KEY ix_rider_profiles_reviewed_at (reviewed_at);
