BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM documents
        WHERE company_id IS NOT NULL
        GROUP BY company_id, file_hash
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Conflicting company document hashes exist; aborting migration.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM documents
        WHERE company_id IS NULL
          AND user_id IS NOT NULL
        GROUP BY user_id, file_hash
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Conflicting independent document hashes exist; aborting migration.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM user_documents
        GROUP BY user_id, document_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Conflicting user-document links exist; aborting migration.';
    END IF;
END $$;

DROP INDEX IF EXISTS public.uq_documents_file_hash;
DROP INDEX IF EXISTS public.unique_user_file_hash;

CREATE UNIQUE INDEX IF NOT EXISTS documents_company_hash_uq
    ON documents (company_id, file_hash)
    WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS documents_independent_user_hash_uq
    ON documents (user_id, file_hash)
    WHERE company_id IS NULL
      AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_documents_user_document_key
    ON user_documents (user_id, document_id);

DROP INDEX IF EXISTS public.uq_user_documents_user_document;

DO $$
DECLARE
    duplicate_index RECORD;
BEGIN
    FOR duplicate_index IN
        SELECT ns.nspname AS schema_name, idx.relname AS index_name
        FROM pg_index index_meta
        INNER JOIN pg_class idx ON idx.oid = index_meta.indexrelid
        INNER JOIN pg_namespace ns ON ns.oid = idx.relnamespace
        WHERE index_meta.indisunique
          AND index_meta.indnkeyatts = 2
          AND index_meta.indkey::int2[] = (
              SELECT array_agg(attribute.attnum ORDER BY key_position.ordinality)::int2[]
              FROM unnest(index_meta.indkey) WITH ORDINALITY AS key_position(attnum, ordinality)
              INNER JOIN pg_attribute attribute
                  ON attribute.attrelid = index_meta.indrelid
                 AND attribute.attnum = key_position.attnum
              WHERE key_position.ordinality <= index_meta.indnkeyatts
          )
          AND index_meta.indrelid = 'public.user_documents'::regclass
          AND idx.relname <> 'user_documents_user_document_key'
    LOOP
        EXECUTE format('DROP INDEX %I.%I', duplicate_index.schema_name, duplicate_index.index_name);
    END LOOP;
END $$;

COMMIT;