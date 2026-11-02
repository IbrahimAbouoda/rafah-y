-- حقول السجل المالي التي يحتاجها التقرير الإداري والمالي: الجهة · بند المصروف · رقم المستند
ALTER TABLE "funding_records"
  ADD COLUMN "counterparty" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "documentNumber" TEXT;
