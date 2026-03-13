-- AlterTable
ALTER TABLE "tax_reports" ADD COLUMN     "file_name" TEXT,
ADD COLUMN     "file_path" TEXT,
ADD COLUMN     "file_size" INTEGER,
ADD COLUMN     "file_type" TEXT,
ADD COLUMN     "generated_at" TIMESTAMP(3);
