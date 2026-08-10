CREATE TABLE IF NOT EXISTS "MessageRead" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MessageRead_messageId_userId_key" ON "MessageRead"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "MessageRead_userId_readAt_idx" ON "MessageRead"("userId", "readAt");
