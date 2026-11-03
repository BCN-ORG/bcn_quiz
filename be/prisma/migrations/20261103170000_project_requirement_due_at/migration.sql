-- Additive and nullable: existing rows keep working, no backfill needed.
ALTER TABLE "course_project_requirements" ADD COLUMN "dueAt" TIMESTAMP(3);
