CREATE TABLE "qualifications" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "profession" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "languages" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qualifications_name_key" ON "qualifications"("name");
CREATE UNIQUE INDEX "profession_name_key" ON "profession"("name");
CREATE UNIQUE INDEX "languages_name_key" ON "languages"("name");

INSERT INTO "qualifications" ("name", "updated_at") VALUES
('SSLC', CURRENT_TIMESTAMP),
('PU', CURRENT_TIMESTAMP),
('Diploma', CURRENT_TIMESTAMP),
('Bachelor''s', CURRENT_TIMESTAMP),
('Masters', CURRENT_TIMESTAMP),
('PHD', CURRENT_TIMESTAMP),
('Degree', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "profession" ("name", "updated_at") VALUES
('Freelancer', CURRENT_TIMESTAMP),
('Self - Employed', CURRENT_TIMESTAMP),
('Student', CURRENT_TIMESTAMP),
('Unemployed', CURRENT_TIMESTAMP),
('Corporate Employee', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "languages" ("name", "updated_at") VALUES
('Assamese', CURRENT_TIMESTAMP),
('Bengali', CURRENT_TIMESTAMP),
('Bodo', CURRENT_TIMESTAMP),
('Dogri', CURRENT_TIMESTAMP),
('English', CURRENT_TIMESTAMP),
('Gujarati', CURRENT_TIMESTAMP),
('Hindi', CURRENT_TIMESTAMP),
('Kannada', CURRENT_TIMESTAMP),
('Kashmiri', CURRENT_TIMESTAMP),
('Konkani', CURRENT_TIMESTAMP),
('Maithili', CURRENT_TIMESTAMP),
('Malayalam', CURRENT_TIMESTAMP),
('Manipuri', CURRENT_TIMESTAMP),
('Marathi', CURRENT_TIMESTAMP),
('Nepali', CURRENT_TIMESTAMP),
('Odia', CURRENT_TIMESTAMP),
('Punjabi', CURRENT_TIMESTAMP),
('Sanskrit', CURRENT_TIMESTAMP),
('Santali', CURRENT_TIMESTAMP),
('Sindhi', CURRENT_TIMESTAMP),
('Tamil', CURRENT_TIMESTAMP),
('Telugu', CURRENT_TIMESTAMP),
('Tulu', CURRENT_TIMESTAMP),
('Urdu', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
