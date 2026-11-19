-- Add pending email-change OTP challenges. The existing User.email is untouched.
-- No existing accounts, sessions, tasks, or verification records are altered.
CREATE TABLE "ChangeEmailOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeEmailOtp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChangeEmailOtp_userId_key" ON "ChangeEmailOtp"("userId");
CREATE INDEX "ChangeEmailOtp_expiresAt_idx" ON "ChangeEmailOtp"("expiresAt");
CREATE INDEX "ChangeEmailOtp_newEmail_idx" ON "ChangeEmailOtp"("newEmail");

ALTER TABLE "ChangeEmailOtp" ADD CONSTRAINT "ChangeEmailOtp_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
