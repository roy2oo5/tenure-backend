-- Users aged 16 and above now receive the full standard-user experience.
-- Keep younger legacy profiles flagged; new under-16 profiles are rejected by validation.
UPDATE "profiles"
SET "is_minor" = false
WHERE "dob" IS NOT NULL
  AND "dob" <= (CURRENT_DATE - INTERVAL '16 years')::date;
