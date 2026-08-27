ALTER TABLE "User" ADD COLUMN "agreementVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "agreementAcceptedAt" DATETIME;
ALTER TABLE "Course" ADD COLUMN "specialPriceEndsAt" TEXT;
ALTER TABLE "Course" ADD COLUMN "maxParticipantsPerOrder" INTEGER;
ALTER TABLE "Course" ADD COLUMN "registrationStartAt" TEXT;
ALTER TABLE "Course" ADD COLUMN "registrationEndAt" TEXT;
ALTER TABLE "RegistrationTemplate" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AuditLog" ADD COLUMN "beforeJson" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "afterJson" TEXT;
