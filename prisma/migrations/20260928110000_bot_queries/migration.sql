-- M9: سجل أسئلة البوت (قرار 2026-09-28) — بلا نص السؤال ولا هوية السائل.
-- CreateEnum
CREATE TYPE "BotQueryStatus" AS ENUM ('ANSWERED', 'UNRESOLVED_ESCALATED');

-- CreateTable
CREATE TABLE "bot_queries" (
    "id" UUID NOT NULL,
    "status" "BotQueryStatus" NOT NULL,
    "matchedFaqId" UUID,
    "inquiryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_queries_inquiryId_key" ON "bot_queries"("inquiryId");

-- CreateIndex
CREATE INDEX "bot_queries_createdAt_status_idx" ON "bot_queries"("createdAt", "status");

-- AddForeignKey
ALTER TABLE "bot_queries" ADD CONSTRAINT "bot_queries_matchedFaqId_fkey" FOREIGN KEY ("matchedFaqId") REFERENCES "faq_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_queries" ADD CONSTRAINT "bot_queries_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "support_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- C-1: كل جدول جديد في public بـ RLS بلا policy (لا وصول عبر Data API)
ALTER TABLE "bot_queries" ENABLE ROW LEVEL SECURITY;
