ALTER TABLE "requests" ADD COLUMN "quick_pick_group_id" TEXT;
CREATE INDEX "requests_quick_pick_group_id_idx" ON "requests"("quick_pick_group_id");
