ALTER TABLE "User" ADD COLUMN "usernameNormalized" TEXT;
UPDATE "User" SET "usernameNormalized" = LOWER(TRIM("username")) WHERE "usernameNormalized" IS NULL;
