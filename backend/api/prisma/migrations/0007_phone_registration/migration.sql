CREATE TABLE IF NOT EXISTS "PhoneRegistrationChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "usedAt" DATETIME,
  "requestIp" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PhoneRegistrationChallenge_phone_createdAt_idx" ON "PhoneRegistrationChallenge"("phone", "createdAt");
CREATE INDEX IF NOT EXISTS "PhoneRegistrationChallenge_expiresAt_usedAt_idx" ON "PhoneRegistrationChallenge"("expiresAt", "usedAt");
