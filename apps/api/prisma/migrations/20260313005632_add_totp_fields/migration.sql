-- AlterTable
ALTER TABLE "users" ADD COLUMN     "recovery_codes" TEXT[],
ADD COLUMN     "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_secret" TEXT,
ADD COLUMN     "totp_verified_at" TIMESTAMP(3);
