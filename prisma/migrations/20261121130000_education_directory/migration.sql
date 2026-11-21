-- Independent reference tables. Student declarations keep their own snapshots.
CREATE TABLE "education_directory_campuses" (
    "id" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "city" TEXT NOT NULL, "search_key" TEXT NOT NULL
);
CREATE TABLE "education_directory_offers" (
    "id" TEXT PRIMARY KEY, "campus_id" TEXT NOT NULL, "label" TEXT NOT NULL,
    "level" TEXT, "rncp" TEXT,
    CONSTRAINT "education_directory_offers_campus_id_fkey" FOREIGN KEY ("campus_id")
      REFERENCES "education_directory_campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "education_directory_offers_campus_id_idx" ON "education_directory_offers"("campus_id");

-- Pilot snapshot from Onisep Idéo (ODbL), consulted 2026-11-21.
-- Source and refresh command: prisma/catalog/education-directory.md
INSERT INTO "education_directory_campuses" ("id","label","city","search_key") VALUES
    ('ENS.23533','My Digital School Grenoble','Saint-Martin-d''Hères','mydigitalschoolgrenoble saintmartindheres 0383585r mdsgrenoble');
INSERT INTO "education_directory_offers" ("id","campus_id","label","level","rncp") VALUES
    ('ENS.23533:AF.139765', 'ENS.23533', 'informatique (My Digital School)', 'bac + 2', NULL),
    ('ENS.23533:AF.120433', 'ENS.23533', 'manager de la stratégie marketing digital', 'bac + 5', '41809'),
    ('ENS.23533:AF.131198', 'ENS.23533', 'bachelor développeur web', 'bac + 3', NULL),
    ('ENS.23533:AF.139731', 'ENS.23533', 'marketing digital (My Digital School)', 'bac + 2', NULL),
    ('ENS.23533:AF.131170', 'ENS.23533', 'manager de la création et du design de marque', 'bac + 5', '40602'),
    ('ENS.23533:AF.133724', 'ENS.23533', 'bachelor cybersécurité et administrateur réseau', 'bac + 3', NULL),
    ('ENS.23533:AF.120434', 'ENS.23533', 'consultant en management de projets', 'bac + 5', '40362'),
    ('ENS.23533:AF.139695', 'ENS.23533', 'Digital Design', 'bac + 2', NULL),
    ('ENS.23533:AF.120431', 'ENS.23533', 'responsable marketing et communication (Ipac - Eduservices)', 'bac + 3', '38131'),
    ('ENS.23533:AF.123616', 'ENS.23533', 'designer graphique (IPAC - Eduservices)', 'bac + 3', '42464'),
    ('ENS.23533:AF.131146', 'ENS.23533', 'manager du développement commercial (IPAC)', 'bac + 5', '40359'),
    ('ENS.23533:AF.133640', 'ENS.23533', 'expert en études et développement du système d''information', 'bac + 5', '40363'),
    ('ENS.23533:AF.120432', 'ENS.23533', 'designer UX-UI', 'bac + 3', '42347');
