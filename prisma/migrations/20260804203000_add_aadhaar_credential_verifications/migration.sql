CREATE TABLE "aadhaar_credential_verifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "issuer" TEXT,
    "extracted_name" TEXT NOT NULL,
    "extracted_dob" TEXT NOT NULL,
    "reference_id" TEXT,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aadhaar_credential_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "aadhaar_credential_verifications_credential_hash_key"
ON "aadhaar_credential_verifications"("credential_hash");
CREATE INDEX "aadhaar_credential_verifications_user_id_verified_at_idx"
ON "aadhaar_credential_verifications"("user_id", "verified_at");
ALTER TABLE "aadhaar_credential_verifications"
ADD CONSTRAINT "aadhaar_credential_verifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
