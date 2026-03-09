-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('EXCHANGE_API', 'CSV_IMPORT', 'BLOCKCHAIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "DataSourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('BUY', 'SELL', 'TRADE', 'TRANSFER_IN', 'TRANSFER_OUT', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'GIFT_RECEIVED', 'GIFT_SENT', 'LOST', 'STOLEN', 'FORK', 'MARGIN_TRADE', 'LIQUIDATION', 'INTERNAL_TRANSFER', 'DEX_SWAP', 'LP_DEPOSIT', 'LP_WITHDRAWAL', 'LP_REWARD', 'WRAP', 'UNWRAP', 'BRIDGE_OUT', 'BRIDGE_IN', 'CONTRACT_APPROVAL', 'NFT_MINT', 'NFT_PURCHASE', 'NFT_SALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HoldingPeriod" AS ENUM ('SHORT_TERM', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "CostBasisMethod" AS ENUM ('FIFO', 'LIFO', 'HIFO');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'CALCULATING', 'COMPLETE', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DataSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_sync_at" TIMESTAMP(3),
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_id" TEXT,
    "type" "TxType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "sent_asset" TEXT,
    "sent_amount" DECIMAL(30,18),
    "sent_value_usd" DECIMAL(20,8),
    "received_asset" TEXT,
    "received_amount" DECIMAL(30,18),
    "received_value_usd" DECIMAL(20,8),
    "fee_asset" TEXT,
    "fee_amount" DECIMAL(30,18),
    "fee_value_usd" DECIMAL(20,8),
    "ai_classified" BOOLEAN NOT NULL DEFAULT false,
    "ai_confidence" DOUBLE PRECISION,
    "original_type" TEXT,
    "cost_basis" DECIMAL(20,8),
    "gain_loss" DECIMAL(20,8),
    "holding_period" "HoldingPeriod",
    "external_id" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_lots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(30,18) NOT NULL,
    "remaining" DECIMAL(30,18) NOT NULL,
    "cost_basis_usd" DECIMAL(20,8) NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL,
    "source_id" TEXT,
    "source" TEXT,
    "transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "method" "CostBasisMethod" NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "short_term_gains" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "short_term_losses" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "long_term_gains" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "long_term_losses" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "total_income" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "total_transactions" INTEGER NOT NULL DEFAULT 0,
    "report_data" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "data_sources_user_id_idx" ON "data_sources"("user_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_timestamp_idx" ON "transactions"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "transactions_user_id_type_idx" ON "transactions"("user_id", "type");

-- CreateIndex
CREATE INDEX "transactions_user_id_external_id_idx" ON "transactions"("user_id", "external_id");

-- CreateIndex
CREATE INDEX "transactions_sent_asset_idx" ON "transactions"("sent_asset");

-- CreateIndex
CREATE INDEX "transactions_received_asset_idx" ON "transactions"("received_asset");

-- CreateIndex
CREATE INDEX "tax_lots_user_id_asset_idx" ON "tax_lots"("user_id", "asset");

-- CreateIndex
CREATE INDEX "tax_lots_user_id_acquired_at_idx" ON "tax_lots"("user_id", "acquired_at");

-- CreateIndex
CREATE INDEX "tax_lots_source_id_idx" ON "tax_lots"("source_id");

-- CreateIndex
CREATE INDEX "tax_reports_user_id_idx" ON "tax_reports"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_reports_user_id_tax_year_method_key" ON "tax_reports"("user_id", "tax_year", "method");

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_reports" ADD CONSTRAINT "tax_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

