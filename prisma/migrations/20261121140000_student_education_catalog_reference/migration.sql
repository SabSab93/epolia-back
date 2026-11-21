CREATE TYPE "StudentEducationSource" AS ENUM ('LEGACY', 'MANUAL', 'CATALOG');

-- Retain labels and identifiers even when an external offer disappears.
ALTER TABLE "student_educations"
  ADD COLUMN "source" "StudentEducationSource" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "catalog_offer_id" VARCHAR(255),
  ADD COLUMN "catalog_campus_id" VARCHAR(255),
  ADD CONSTRAINT "student_educations_catalog_origin_check" CHECK (
    ("source" = 'CATALOG' AND "catalog_offer_id" IS NOT NULL AND "catalog_campus_id" IS NOT NULL) OR
    ("source" <> 'CATALOG' AND "catalog_offer_id" IS NULL AND "catalog_campus_id" IS NULL)
  ),
  ADD CONSTRAINT "student_educations_manual_study_field_check" CHECK (
    "source" <> 'MANUAL' OR "study_field_id" IS NULL
  );
