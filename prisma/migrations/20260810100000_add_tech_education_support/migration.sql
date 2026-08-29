INSERT INTO "categories" ("name", "description", "created_at", "updated_at")
VALUES (
  'Tech & Education Support',
  'Helping someone with technology, learning, or educational needs, such as understanding software, setting up devices, learning new skills, completing assignments, or getting guidance with studies and projects.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE
SET
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;
