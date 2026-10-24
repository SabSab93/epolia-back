BEGIN;

-- A NOT VALID CHECK still rejects every later UPDATE of a historical NULL row.
-- Keep those rows manageable without admitting new accounts or reactivation.
ALTER TABLE "users" DROP CONSTRAINT "users_birth_date_required";

CREATE FUNCTION enforce_user_birth_date() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'DELETED' OR NEW.birth_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Birth date is required for new accounts'
      USING ERRCODE = '23514', CONSTRAINT = 'users_birth_date_required';
  END IF;

  IF OLD.birth_date IS NOT NULL
     OR (NEW.status = 'ACTIVE' AND OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    RAISE EXCEPTION 'Birth date cannot be cleared or omitted on reactivation'
      USING ERRCODE = '23514', CONSTRAINT = 'users_birth_date_required';
  END IF;

  -- An existing undated account may be suspended or processed administratively.
  -- Login, protected routes and role assignment still reject it in the API.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_birth_date_required
BEFORE INSERT OR UPDATE ON "users"
FOR EACH ROW EXECUTE FUNCTION enforce_user_birth_date();

COMMIT;
