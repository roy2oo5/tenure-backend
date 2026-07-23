ALTER TABLE "requests"
  ADD COLUMN "ready_to_pay_travel_charges" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ready_to_pay_tip" BOOLEAN NOT NULL DEFAULT false;
