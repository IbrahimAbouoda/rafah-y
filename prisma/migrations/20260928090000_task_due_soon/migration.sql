-- S5-1: تذكير «اقتراب موعد مهمة» مرة واحدة لكل موعد (§8.2)
-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "dueSoonNotifiedFor" TIMESTAMP(3);
