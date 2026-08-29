ALTER TABLE "reports" ADD COLUMN "request_id" INTEGER;

CREATE UNIQUE INDEX "reports_reporter_id_request_id_key"
ON "reports"("reporter_id", "request_id");

CREATE INDEX "reports_request_id_idx" ON "reports"("request_id");

ALTER TABLE "reports"
ADD CONSTRAINT "reports_request_id_fkey"
FOREIGN KEY ("request_id") REFERENCES "requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
