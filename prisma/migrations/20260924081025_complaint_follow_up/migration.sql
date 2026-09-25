-- AlterTable
ALTER TABLE "complaints" ADD COLUMN     "followUpAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "complaints_followUpAt_idx" ON "complaints"("followUpAt");
