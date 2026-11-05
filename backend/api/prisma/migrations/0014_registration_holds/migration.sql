CREATE TABLE "RegistrationHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "consumedCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "activeKey" TEXT,
    "orderId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RegistrationHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RegistrationHold_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RegistrationHold_activeKey_key" ON "RegistrationHold"("activeKey");
CREATE UNIQUE INDEX "RegistrationHold_orderId_key" ON "RegistrationHold"("orderId");
CREATE INDEX "RegistrationHold_userId_courseId_status_idx" ON "RegistrationHold"("userId", "courseId", "status");
CREATE INDEX "RegistrationHold_status_expiresAt_idx" ON "RegistrationHold"("status", "expiresAt");
