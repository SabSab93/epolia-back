ALTER TABLE "student_educations" ADD COLUMN "creation_key" UUID;

CREATE UNIQUE INDEX "student_educations_student_id_creation_key_key"
    ON "student_educations"("student_id", "creation_key");
