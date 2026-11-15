ALTER TABLE "student_profiles"
    ALTER COLUMN "domain_id" DROP NOT NULL,
    ADD CONSTRAINT "student_profiles_visible_requires_domain"
        CHECK ("status" <> 'VISIBLE' OR "domain_id" IS NOT NULL);
