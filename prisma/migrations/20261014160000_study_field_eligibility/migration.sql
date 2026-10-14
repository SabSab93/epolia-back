CREATE TABLE "study_fields" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "study_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "study_field_specialties" (
    "study_field_id" UUID NOT NULL,
    "specialty_id" UUID NOT NULL,
    CONSTRAINT "study_field_specialties_pkey" PRIMARY KEY ("study_field_id", "specialty_id")
);

ALTER TABLE "student_educations" ADD COLUMN "study_field_id" UUID;

CREATE UNIQUE INDEX "study_fields_label_key" ON "study_fields"("label");
CREATE INDEX "study_field_specialties_specialty_id_idx" ON "study_field_specialties"("specialty_id");
CREATE INDEX "student_educations_study_field_id_idx" ON "student_educations"("study_field_id");

ALTER TABLE "study_field_specialties" ADD CONSTRAINT "study_field_specialties_study_field_id_fkey"
    FOREIGN KEY ("study_field_id") REFERENCES "study_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "study_field_specialties" ADD CONSTRAINT "study_field_specialties_specialty_id_fkey"
    FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_educations" ADD CONSTRAINT "student_educations_study_field_id_fkey"
    FOREIGN KEY ("study_field_id") REFERENCES "study_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
