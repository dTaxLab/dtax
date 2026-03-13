-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "cpa_user_id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'PENDING',
    "invite_token" TEXT,
    "invite_expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_user_id_key" ON "clients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_invite_token_key" ON "clients"("invite_token");

-- CreateIndex
CREATE INDEX "clients_cpa_user_id_idx" ON "clients"("cpa_user_id");

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_cpa_user_id_fkey" FOREIGN KEY ("cpa_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
