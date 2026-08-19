CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
ON users (lower(trim(email)));