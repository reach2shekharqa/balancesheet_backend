ALTER TABLE audit_logs ALTER COLUMN admin_id DROP NOT NULL;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_admin_id_fkey;
ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_admin_id_fkey
    FOREIGN KEY (admin_id)
    REFERENCES public.users(user_id)
    ON DELETE SET NULL;