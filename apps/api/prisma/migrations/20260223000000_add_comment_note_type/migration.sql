-- Story 3.4: Add COMMENT to NoteType enum for task/workflow step comments
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'COMMENT';
