-- AlterTable: Add sub-task hierarchy, user report, AI scoring, and workflow linkage to notes
ALTER TABLE "notes" ADD COLUMN "parent_note_id" TEXT;
ALTER TABLE "notes" ADD COLUMN "user_report" TEXT;
ALTER TABLE "notes" ADD COLUMN "ai_score" INTEGER;
ALTER TABLE "notes" ADD COLUMN "ai_feedback" TEXT;
ALTER TABLE "notes" ADD COLUMN "expected_outcome" TEXT;
ALTER TABLE "notes" ADD COLUMN "workflow_step_number" INTEGER;

-- CreateIndex
CREATE INDEX "notes_parent_note_id_idx" ON "notes"("parent_note_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_parent_note_id_fkey" FOREIGN KEY ("parent_note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
