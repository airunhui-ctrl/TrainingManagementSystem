ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "heldSeats" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "RegistrationHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "consumedCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "activeKey" TEXT,
    "orderId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RegistrationHold_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RegistrationHold_activeKey_key" ON "RegistrationHold"("activeKey");
CREATE UNIQUE INDEX IF NOT EXISTS "RegistrationHold_orderId_key" ON "RegistrationHold"("orderId");
CREATE INDEX IF NOT EXISTS "RegistrationHold_userId_courseId_status_idx" ON "RegistrationHold"("userId", "courseId", "status");
CREATE INDEX IF NOT EXISTS "RegistrationHold_status_expiresAt_idx" ON "RegistrationHold"("status", "expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RegistrationHold_userId_fkey') THEN
    ALTER TABLE "RegistrationHold"
      ADD CONSTRAINT "RegistrationHold_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RegistrationHold_courseId_fkey') THEN
    ALTER TABLE "RegistrationHold"
      ADD CONSTRAINT "RegistrationHold_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
