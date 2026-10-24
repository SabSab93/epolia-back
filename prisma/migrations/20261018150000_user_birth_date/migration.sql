-- No guessed dates or automatic activation for historical accounts.
ALTER TABLE "users" ADD COLUMN "birth_date" DATE;
ALTER TABLE "users" ADD CONSTRAINT "users_birth_date_required"
  CHECK ("status" = 'DELETED' OR "birth_date" IS NOT NULL) NOT VALID;
