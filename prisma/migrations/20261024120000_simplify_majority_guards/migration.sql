-- Age and required birth dates are checked by the API for CUSTOMER/STUDENT.
-- No database-wide guard: ADMIN accounts do not require a birth date.
DROP TRIGGER IF EXISTS users_birth_date_required ON "users";
DROP FUNCTION IF EXISTS enforce_user_birth_date();
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_birth_date_required";
