-- Employee-count ranges change (owner decision, Nov 2026): 1–5 / 6–10 / 11–25 / 26–50 / 50+
-- become <5 / 5–10 / 11–20 / 21–50 / 51–100 / 100+. Stored answers move to the new range:
-- from the company's exact employee count when there is one, else the nearest new range.
UPDATE "intake_responses" r
SET "value" = to_jsonb(CASE
    WHEN c."employees" IS NOT NULL AND c."employees" < 5 THEN '<5'
    WHEN c."employees" IS NOT NULL AND c."employees" <= 10 THEN '5–10'
    WHEN c."employees" IS NOT NULL AND c."employees" <= 20 THEN '11–20'
    WHEN c."employees" IS NOT NULL AND c."employees" <= 50 THEN '21–50'
    WHEN c."employees" IS NOT NULL AND c."employees" <= 100 THEN '51–100'
    WHEN c."employees" IS NOT NULL THEN '100+'
    WHEN r."value" #>> '{}' = '1–5' THEN '<5'
    WHEN r."value" #>> '{}' = '6–10' THEN '5–10'
    WHEN r."value" #>> '{}' = '11–25' THEN '11–20'
    WHEN r."value" #>> '{}' = '26–50' THEN '21–50'
    WHEN r."value" #>> '{}' = '50+' THEN '51–100'
    ELSE r."value" #>> '{}'
  END)
FROM "companies" c
WHERE c."id" = r."company_id"
  AND r."section" = 'company'
  AND r."field" = 'employees_range'
  AND r."value" #>> '{}' IN ('1–5', '6–10', '11–25', '26–50', '50+');
