CREATE TABLE IF NOT EXISTS "PasswordResetChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetValue" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "usedAt" DATETIME,
  "requestIp" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PasswordResetChallenge_userId_createdAt_idx" ON "PasswordResetChallenge"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetChallenge_expiresAt_usedAt_idx" ON "PasswordResetChallenge"("expiresAt", "usedAt");
