-- Add departmentTags to conversations for role-based scoping (Story 5.4)
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "department_tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add departmentTags to process runs for result filtering (Story 5.3)
ALTER TABLE "process_runs" ADD COLUMN IF NOT EXISTS "department_tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
