-- P1: 独立学员域基础模型。
-- 本迁移只新增表和索引，不回填历史 participants，也不删除 Order.participants。

CREATE TABLE IF NOT EXISTS "Student" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "phoneNormalized" TEXT,
  "gender" TEXT,
  "email" TEXT,
  "company" TEXT,
  "department" TEXT,
  "position" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "mergedIntoId" TEXT,
  "extraPayload" TEXT,
  "createdByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Student_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Student_phoneNormalized_idx" ON "Student"("phoneNormalized");
CREATE INDEX IF NOT EXISTS "Student_status_updatedAt_idx" ON "Student"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "Student_mergedIntoId_idx" ON "Student"("mergedIntoId");

CREATE TABLE IF NOT EXISTS "AccountStudent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "relationType" TEXT NOT NULL DEFAULT 'other',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'user_created',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdByUserId" TEXT,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AccountStudent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountStudent_userId_studentId_key" UNIQUE ("userId", "studentId")
);
CREATE INDEX IF NOT EXISTS "AccountStudent_userId_status_isDefault_idx" ON "AccountStudent"("userId", "status", "isDefault");
CREATE INDEX IF NOT EXISTS "AccountStudent_studentId_status_idx" ON "AccountStudent"("studentId", "status");

CREATE TABLE IF NOT EXISTS "RegistrationTemplateVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "payload" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdByUserId" TEXT,
  "publishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RegistrationTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RegistrationTemplateVersion_templateId_version_key" UNIQUE ("templateId", "version")
);
CREATE INDEX IF NOT EXISTS "RegistrationTemplateVersion_templateId_status_idx" ON "RegistrationTemplateVersion"("templateId", "status");

CREATE TABLE IF NOT EXISTS "Enrollment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "orderId" TEXT,
  "accountUserId" TEXT NOT NULL,
  "sourceParticipantIndex" INTEGER NOT NULL,
  "templateVersionId" TEXT,
  "templateVersion" INTEGER,
  "formPayload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'registered',
  "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Enrollment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Enrollment_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "RegistrationTemplateVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Enrollment_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Enrollment_orderId_sourceParticipantIndex_key" UNIQUE ("orderId", "sourceParticipantIndex")
);
CREATE INDEX IF NOT EXISTS "Enrollment_studentId_registeredAt_idx" ON "Enrollment"("studentId", "registeredAt");
CREATE INDEX IF NOT EXISTS "Enrollment_courseId_status_idx" ON "Enrollment"("courseId", "status");
CREATE INDEX IF NOT EXISTS "Enrollment_accountUserId_registeredAt_idx" ON "Enrollment"("accountUserId", "registeredAt");
CREATE INDEX IF NOT EXISTS "Enrollment_templateVersionId_idx" ON "Enrollment"("templateVersionId");
