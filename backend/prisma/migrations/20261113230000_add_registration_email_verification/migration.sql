-- Day 16: verification status for registration email OTP.
-- All accounts created before this migration are trusted as already
-- registered, so their existing login access is preserved.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL;

-- Future registrations start with emailVerifiedAt = NULL and only
-- the application sets a timestamp after successful OTP verification.
CREATE TABLE "RegistrationOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationOtp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationOtp_userId_key" ON "RegistrationOtp"("userId");
CREATE INDEX "RegistrationOtp_expiresAt_idx" ON "RegistrationOtp"("expiresAt");

ALTER TABLE "RegistrationOtp" ADD CONSTRAINT "RegistrationOtp_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
