-- P2：历史 participants 回填的批次、异常与人工处理记录。
-- 仅新增运维表，不修改或删除 Order.participants。

CREATE TABLE IF NOT EXISTS "StudentMigrationBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'running',
  "cursorOrderId" TEXT,
  "totalOrders" INTEGER NOT NULL DEFAULT 0,
  "processedOrders" INTEGER NOT NULL DEFAULT 0,
  "createdStudents" INTEGER NOT NULL DEFAULT 0,
  "createdEnrollments" INTEGER NOT NULL DEFAULT 0,
  "skippedParticipants" INTEGER NOT NULL DEFAULT 0,
  "issueCount" INTEGER NOT NULL DEFAULT 0,
  "summary" TEXT NOT NULL DEFAULT '{}',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "StudentMigrationBatch_status_startedAt_idx" ON "StudentMigrationBatch"("status", "startedAt");

CREATE TABLE IF NOT EXISTS "StudentMigrationIssue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "orderId" TEXT,
  "sourceParticipantIndex" INTEGER,
  "issueType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "rawPayload" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "handledByUserId" TEXT,
  "handledAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentMigrationIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StudentMigrationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentMigrationIssue_handledByUserId_fkey" FOREIGN KEY ("handledByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StudentMigrationIssue_batchId_status_idx" ON "StudentMigrationIssue"("batchId", "status");
CREATE INDEX IF NOT EXISTS "StudentMigrationIssue_orderId_participant_idx" ON "StudentMigrationIssue"("orderId", "sourceParticipantIndex");
CREATE INDEX IF NOT EXISTS "StudentMigrationIssue_issueType_status_idx" ON "StudentMigrationIssue"("issueType", "status");
