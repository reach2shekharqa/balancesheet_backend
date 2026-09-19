# Database Schema Overview

```mermaid
erDiagram
    USERS {
        bigint id PK
        text user_id UK
        text user_name
        text email
        text password
        int upload_count
        int uploads_used
        int upload_quota
        int upload_limit_mb
        int storage_used_mb
        int storage_limit_mb
        text role
        boolean is_active
        boolean is_deleted
        timestamptz created_at
    }

    COMPANIES {
        bigint id PK
        text cin UK
        text pan
        text company_name
        text normalized_company_name
        boolean is_active
        timestamptz created_at
    }

    COMPANY_USERS {
        bigint company_id FK
        text user_id FK
        text access_role
        timestamptz created_at
    }

    DOCUMENTS {
        bigint id PK
        text file_hash
        int document_version
        text original_filename
        text reporting_unit
        timestamptz uploaded_at
        text extraction_status
        jsonb extraction_payload
        bigint user_id FK
        bigint company_id FK
        timestamptz created_at
    }

    DOCUMENT_TABLES {
        bigint id PK
        bigint document_id FK
        text section_name
        text table_name
        int table_index
        jsonb rows_json
    }

    DOCUMENT_ROWS {
        bigint id PK
        bigint document_id FK
        bigint table_id FK
        int row_index
        jsonb row_values
    }

    FINANCIAL_METRICS {
        bigint id PK
        bigint document_id FK
        text section_name
        text metric_name
        text label
        numeric current
        numeric previous
        text notes
        text source_type
        text table_type
        int page
        int year
        text canonical_metric
        numeric normalized_value
        text original_value
        text original_header
        numeric confidence
        boolean is_total_row
        boolean is_subtotal_row
        boolean is_header_row
        boolean is_blank_row
        int row_index
        bigint table_id
        text unit
    }

    CALCULATED_METRICS {
        bigint id PK
        bigint document_id FK
        text metric_name
        text formula
        numeric result
        jsonb details
    }

    METRIC_VARIANCE_ALERTS {
        bigint id PK
        bigint document_id FK
        text metric_key
        text section_name
        numeric previous_value
        numeric current_value
        numeric variance_percent
        text severity
    }

    ROW_CHANGE_LOG {
        bigint id PK
        bigint document_id FK
        bigint previous_document_id FK
        text metric_key
        text section_name
        numeric previous_value
        numeric new_value
        text change_type
    }

    USER_DOCUMENTS {
        bigint id PK
        text user_id
        bigint document_id FK
    }

    PLANS {
        bigint id PK
        text code UK
        text name
        numeric price
        int upload_quota
        int storage_limit_mb
        boolean is_active
    }

    USER_SUBSCRIPTIONS {
        bigint id PK
        text user_id FK
        bigint plan_id FK
        text status
        timestamptz started_at
        timestamptz expires_at
        text payment_provider
        text payment_reference
    }

    USER_STORAGE_LOGS {
        bigint id PK
        text user_id
        text file_hash
        numeric file_size_mb
        text action
        bigint extraction_id FK
    }

    AUDIT_LOGS {
        bigint id PK
        text admin_id FK
        text action
        text target_type
        text target_id
        jsonb changes
    }

    USERS ||--o{ COMPANY_USERS : access
    USERS ||--o{ DOCUMENTS : uploads
    COMPANIES ||--o{ COMPANY_USERS : grants_access
    COMPANIES ||--o{ DOCUMENTS : belongs_to
    DOCUMENTS ||--o{ DOCUMENT_TABLES : contains
    DOCUMENT_TABLES ||--o{ DOCUMENT_ROWS : has
    DOCUMENTS ||--o{ FINANCIAL_METRICS : extracts
    DOCUMENTS ||--o{ CALCULATED_METRICS : stores
    DOCUMENTS ||--o{ METRIC_VARIANCE_ALERTS : raises
    DOCUMENTS ||--o{ ROW_CHANGE_LOG : tracks
    DOCUMENTS ||--o{ USER_DOCUMENTS : links
    USERS ||--o{ USER_DOCUMENTS : owns
    USERS ||--o{ USER_SUBSCRIPTIONS : subscribes
    PLANS ||--o{ USER_SUBSCRIPTIONS : includes
    DOCUMENTS ||--o{ USER_STORAGE_LOGS : logs
    USERS ||--o{ AUDIT_LOGS : performs
```

## Key idea

The core flow is:

`users` -> `companies` -> `documents` -> `document_tables` -> `document_rows` -> `financial_metrics`

This database stores:

- user/company access
- uploaded PDFs and cached extraction payloads
- parsed tables and rows
- extracted financial metrics
- comparison alerts and change logs
- subscription and quota tracking
- admin audit trail
0000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000
cd "C:\Users\HP\Desktop\balcnce sheet poc\balancesheet_backend"

py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
python -m pip install streamlit pandas psycopg2-binary python-dotenv llama-parse

streamlit run poc/streamlit_financial_app.py --server.port 8501

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
