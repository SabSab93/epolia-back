ALTER TABLE "education_directory_campuses" ADD COLUMN "address" TEXT;
ALTER TABLE "education_directory_offers" ADD COLUMN "detail" TEXT;

-- Source snapshot for the bundled pilot. The national import supplies these fields elsewhere.
UPDATE "education_directory_campuses" SET "address" = '22 rue Galilée' WHERE "id" = 'ENS.23533';
UPDATE "education_directory_offers" AS offer
SET "detail" = source.detail
FROM (VALUES
  ('ENS.23533:AF.139765', '2 ans · temps plein, cours en présentiel'),
  ('ENS.23533:AF.120433', '2 ans · temps plein, cours en présentiel'),
  ('ENS.23533:AF.131198', '1 an · temps plein, cours en présentiel'),
  ('ENS.23533:AF.139731', '2 ans · temps plein, cours en présentiel'),
  ('ENS.23533:AF.131170', '2 ans · temps plein, cours en présentiel'),
  ('ENS.23533:AF.133724', '1 an · temps plein, cours en présentiel'),
  ('ENS.23533:AF.120434', '2 ans · temps plein, cours en présentiel'),
  ('ENS.23533:AF.139695', '2 ans · temps plein, cours en présentiel'),
  ('ENS.23533:AF.120431', '1 an · temps plein, cours en présentiel'),
  ('ENS.23533:AF.123616', '1 an · temps plein, cours en présentiel'),
  ('ENS.23533:AF.131146', '2 ans · temps plein, cours en présentiel'),
  ('ENS.23533:AF.133640', '2 ans · temps plein, cours en présentiel'),
  ('ENS.23533:AF.120432', '1 an · temps plein, cours en présentiel')
) AS source(id, detail)
WHERE offer."id" = source.id;
