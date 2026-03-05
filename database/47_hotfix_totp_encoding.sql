-- Hotfix to repair the invalid 'base32' encoding crashing the tickets table inserts
ALTER TABLE tickets ALTER COLUMN totp_secret DROP DEFAULT;
ALTER TABLE tickets ALTER COLUMN totp_secret SET DEFAULT encode(gen_random_bytes(20), 'hex');
