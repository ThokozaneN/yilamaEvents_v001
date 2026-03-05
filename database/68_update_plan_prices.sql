-- 68_update_plan_prices.sql
-- Updates plan prices to R79 (Pro) and R119 (Premium)
UPDATE plans SET price = 79.00  WHERE id = 'pro';
UPDATE plans SET price = 119.00 WHERE id = 'premium';
