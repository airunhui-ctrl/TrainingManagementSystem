CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
  "name" TEXT,
  "company" TEXT,
  "avatarText" TEXT,
  "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "points" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

CREATE TABLE IF NOT EXISTS "Course" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "category" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "instructor" TEXT NOT NULL,
  "price" REAL NOT NULL,
  "originalPrice" REAL,
  "specialPrice" REAL,
  "allowMultiParticipant" BOOLEAN NOT NULL DEFAULT true,
  "registrationDeadline" TEXT,
  "capacity" INTEGER NOT NULL,
  "enrolled" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "registrationTemplateId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "RegistrationTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT,
  "name" TEXT NOT NULL DEFAULT '报名模板',
  "version" INTEGER NOT NULL DEFAULT 1,
  "payload" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "Course_registrationTemplateId_idx" ON "Course"("registrationTemplateId");

CREATE TABLE IF NOT EXISTS "Order" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "participantCount" INTEGER NOT NULL,
  "participants" TEXT NOT NULL,
  "originalAmount" REAL NOT NULL,
  "discount" REAL NOT NULL,
  "amount" REAL NOT NULL,
  "status" TEXT NOT NULL,
  "paymentMethod" TEXT,
  "paymentChannel" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_courseId_status_idx" ON "Order"("courseId", "status");

CREATE TABLE IF NOT EXISTS "PaymentProof" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "path" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "remark" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" DATETIME,
  CONSTRAINT "PaymentProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PaymentProof_orderId_createdAt_idx" ON "PaymentProof"("orderId", "createdAt");

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "orderIds" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" DATETIME,
  CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Invoice_userId_createdAt_idx" ON "Invoice"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "Preview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Preview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Preview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Preview_userId_courseId_key" ON "Preview"("userId", "courseId");

CREATE TABLE IF NOT EXISTS "Feedback" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "repliedAt" DATETIME,
  CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "PointLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Message" ("id" TEXT NOT NULL PRIMARY KEY, "payload" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "AuditLog" ("id" TEXT NOT NULL PRIMARY KEY, "actor" TEXT NOT NULL, "action" TEXT NOT NULL, "detail" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "Banner" ("id" TEXT NOT NULL PRIMARY KEY, "payload" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "sort" INTEGER NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
CREATE TABLE IF NOT EXISTS "PaymentSetting" ("id" TEXT NOT NULL PRIMARY KEY, "payload" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL);
CREATE TABLE IF NOT EXISTS "DiscountRule" ("id" TEXT NOT NULL PRIMARY KEY, "minPeople" INTEGER NOT NULL, "discountRate" REAL NOT NULL, "scopeCourseIds" TEXT NOT NULL DEFAULT '[]', "enabled" BOOLEAN NOT NULL DEFAULT true, "updatedAt" DATETIME NOT NULL);
CREATE TABLE IF NOT EXISTS "SystemConfig" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "description" TEXT, "updatedAt" DATETIME NOT NULL);
