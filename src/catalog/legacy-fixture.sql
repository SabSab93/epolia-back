INSERT INTO users (id, email, updated_at) VALUES
('10000000-0000-4000-8000-000000000001', 'legacy-student@test.invalid', NOW()),
('10000000-0000-4000-8000-000000000002', 'legacy-customer@test.invalid', NOW());
-- Accounts dedicated to the majority migration regression tests.
INSERT INTO users (id, email, updated_at) VALUES
('10000000-0000-4000-8000-000000000008', 'legacy-admin@test.invalid', NOW()),
('10000000-0000-4000-8000-000000000009', 'legacy-managed@test.invalid', NOW());
INSERT INTO user_roles (user_id, role) VALUES
('10000000-0000-4000-8000-000000000008', 'ADMIN'),
('10000000-0000-4000-8000-000000000009', 'CUSTOMER');
INSERT INTO user_roles (user_id, role) VALUES
('10000000-0000-4000-8000-000000000001', 'STUDENT'),
('10000000-0000-4000-8000-000000000002', 'CUSTOMER');
INSERT INTO domains (id, label) VALUES ('10000000-0000-4000-8000-000000000003', 'Legacy domain');
INSERT INTO specialties (id, domain_id, label) VALUES
('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'Legacy specialty');
INSERT INTO student_profiles (user_id, domain_id, updated_at) VALUES
('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', NOW());
INSERT INTO student_educations (id, student_id, title, school, updated_at) VALUES
('10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Legacy education', 'Legacy school', NOW());
INSERT INTO student_specialties (student_id, specialty_id, pricing_type, price_cents, updated_at) VALUES
('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'HOURLY', 1450, NOW());
INSERT INTO missions (id, customer_user_id, student_id, description, updated_at) VALUES
('10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Historical mission', NOW());
INSERT INTO mission_items (id, mission_id, specialty_id, specialty_label, pricing_type, unit_price_cents) VALUES
('10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', 'Contractual snapshot', 'HOURLY', 1450);
