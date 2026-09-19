import hashlib
import html
import json
import os
import re
from pathlib import Path

import pandas as pd
import psycopg2
import streamlit as st
from dotenv import load_dotenv
from llama_parse import LlamaParse


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / ".env"
OUTPUT_DIR = PROJECT_ROOT / "poc" / "output"
UPLOAD_DIR = PROJECT_ROOT / "poc" / "uploads"
CACHE_FILE = PROJECT_ROOT / "poc" / "pdf_cache.json"


def load_project_env():
    if ENV_PATH.exists():
        load_dotenv(ENV_PATH)
    return os.getenv("LLAMA_CLOUD_API_KEY")


def ensure_folders():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)


def log_step(message):
    print(f"[financial-analyzer] {message}")


def file_hash(file_path: Path):
    digest = hashlib.sha256()
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    result = digest.hexdigest()
    log_step(f"Computed PDF hash for {file_path.name}: {result}")
    return result


def load_cache():
    if not CACHE_FILE.exists():
        log_step(f"No local PDF cache file found at {CACHE_FILE}")
        return {}
    try:
        data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        log_step(f"Loaded local PDF cache with {len(data)} entries")
        return data
    except Exception:
        log_step(f"Cache file is unreadable; starting with empty local cache.")
        return {}


def save_cache(cache):
    CACHE_FILE.write_text(json.dumps(cache, indent=2), encoding="utf-8")


def get_supabase_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL is missing from balancesheet_backend/.env")

    log_step("Connecting to Supabase PostgreSQL database")
    return psycopg2.connect(database_url)


def find_existing_markdown_for_hash(file_hash_value):
    conn = get_supabase_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, file_hash, extraction_status, extraction_payload, original_filename
                FROM public.documents
                WHERE file_hash = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (file_hash_value,),
            )
            row = cur.fetchone()

        if not row:
            log_step(f"No document row exists in Supabase for hash {file_hash_value}")
            return None

        document_id, _, status, payload, original_filename = row
        if status == "completed" and payload and payload.get("markdown"):
            log_step(f"Found completed markdown in Supabase for hash {file_hash_value} on document id {document_id}")
            return payload["markdown"]

        log_step(f"Document exists in Supabase but no completed markdown payload for hash {file_hash_value}")
        return None
    finally:
        conn.close()


def save_markdown_to_supabase(file_hash_value, original_filename, markdown_text):
    conn = get_supabase_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, extraction_status, extraction_payload
                FROM public.documents
                WHERE file_hash = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (file_hash_value,),
            )
            row = cur.fetchone()

            payload = {
                "markdown": markdown_text,
                "updated_from": "streamlit_financial_app",
            }

            if row:
                document_id = row[0]
                cur.execute(
                    """
                    UPDATE public.documents
                    SET extraction_status = %s,
                        extraction_payload = %s,
                        original_filename = %s,
                        uploaded_at = NOW()
                    WHERE id = %s
                    """,
                    ("completed", json.dumps(payload), original_filename, document_id),
                )
                log_step(f"Updated existing Supabase document row {document_id} with parsed markdown.")
            else:
                cur.execute(
                    """
                    INSERT INTO public.documents (
                        file_hash,
                        original_filename,
                        extraction_status,
                        extraction_payload,
                        user_id,
                        company_id
                    )
                    VALUES (%s, %s, %s, %s, NULL, NULL)
                    """,
                    (file_hash_value, original_filename, "completed", json.dumps(payload),),
                )
                log_step(f"Inserted new Supabase document row for hash {file_hash_value}.")

        conn.commit()
    finally:
        conn.close()


def normalize_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def parse_markdown_tables(section_text):
    blocks = []
    pattern = r"(?ms)(?:^|\n)(\|.*\|(?:\n\|[-: ]+\|)+(?:\n\|.*\|)+)"
    for match in re.finditer(pattern, section_text):
        blocks.append(match.group(1).strip())

    tables = []
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue

        rows = []
        for line in lines:
            if not line.startswith("|"):
                continue
            rows.append([cell.strip() for cell in line.strip("|").split("|")])

        if len(rows) < 2:
            continue

        header = rows[0]
        data_rows = rows[2:] if len(rows) > 2 and re.fullmatch(r"\|?\s*[:-]+\s*\|.*", rows[1]) else rows[1:]

        try:
            df = pd.DataFrame(data_rows, columns=header)
            tables.append(df)
        except Exception:
            tables.append(pd.DataFrame([row for row in data_rows]))

    return tables


def find_sections(markdown_text):
    cleaned = markdown_text.replace("\r", "")
    lines = cleaned.split("\n")
    headings = []
    section_map = []
    keywords = [
        "balance sheet",
        "profit and loss",
        "income statement",
        "p&l",
        "statement of profit and loss",
        "profit loss",
        "liabilities",
        "assets",
        "cash flow",
        "statement of changes in equity",
        "notes to financial statements",
    ]

    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        match = re.match(r"^(#{1,6})\s*(.+)$", stripped)
        if match:
            heading_text = match.group(2).strip()
            if any(keyword in heading_text.lower() for keyword in keywords):
                headings.append({"title": heading_text, "start": index})
            continue

        bold_match = re.match(r"^\*\*(.+?)\*\*$", stripped)
        if bold_match:
            heading_text = bold_match.group(1).strip()
            if any(keyword in heading_text.lower() for keyword in keywords):
                headings.append({"title": heading_text, "start": index})

    for i, heading in enumerate(headings):
        start = heading["start"] + 1
        end = headings[i + 1]["start"] if i + 1 < len(headings) else len(lines)
        content = "\n".join(lines[start:end]).strip()
        section_map.append({
            "title": heading["title"],
            "content": content,
        })

    relevant = []
    for section in section_map:
        text = section["title"].lower() + " " + section["content"].lower()
        if any(keyword in text for keyword in keywords):
            relevant.append(section)

    if not relevant:
        return [{"title": "Extracted content", "content": markdown_text}]

    return relevant


def parse_pdf_and_extract(pdf_path: Path):
    ensure_folders()
    log_step(f"Starting PDF processing for {pdf_path.name}")
    file_hash_value = file_hash(pdf_path)

    existing_markdown = find_existing_markdown_for_hash(file_hash_value)
    if existing_markdown is not None:
        output_file = OUTPUT_DIR / f"{pdf_path.stem}_{file_hash_value[:12]}_parsed.md"
        output_file.write_text(existing_markdown, encoding="utf-8")
        log_step(f"Reused markdown from Supabase for hash {file_hash_value}; saved local copy to {output_file}")
        return existing_markdown, output_file, "db-hit"

    log_step(f"No valid markdown found in Supabase for this PDF hash; proceeding to LlamaParse.")
    api_key = load_project_env()
    if not api_key:
        raise ValueError("LLAMA_CLOUD_API_KEY is missing from balancesheet_backend/.env")

    log_step(f"Calling LlamaParse for {pdf_path.name}")
    parser = LlamaParse(
        api_key=api_key,
        result_type="markdown",
        split_by_page=True,
        verbose=False,
        max_timeout=600,
        check_interval=2,
        ignore_errors=False,
    )

    documents = parser.load_data(str(pdf_path))
    output_text = "\n\n---\n\n".join(
        doc.text if hasattr(doc, "text") else (doc.get_text() if hasattr(doc, "get_text") else str(doc))
        for doc in documents
    )

    if not output_text.strip():
        raise ValueError("LlamaParse returned empty markdown output.")

    output_file = OUTPUT_DIR / f"{pdf_path.stem}_{file_hash_value[:12]}_parsed.md"
    output_file.write_text(output_text, encoding="utf-8")
    save_markdown_to_supabase(file_hash_value, pdf_path.name, output_text)
    log_step(f"Saved parsed markdown locally and to Supabase for hash {file_hash_value}: {output_file}")

    return output_text, output_file, "llamaparse"


def normalize_search_phrase(value):
    if value is None:
        return ""
    text = str(value).lower()
    text = text.replace("&", " and ")
    text = text.replace("/", " ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fuzzy_match_text(value, query):
    if not value or not query:
        return False
    normalized_value = normalize_search_phrase(value)
    normalized_query = normalize_search_phrase(query)
    if not normalized_query:
        return False
    if normalized_query in normalized_value:
        return True

    query_tokens = normalized_query.split()
    if not query_tokens:
        return False

    value_tokens = normalized_value.split()
    if len(query_tokens) == 1:
        return query_tokens[0] in value_tokens

    synonym_map = {
        "blnce": "balance",
        "balnce": "balance",
        "pnl": "profit and loss",
        "pl": "profit and loss",
        "bs": "balance sheet",
        "loss": "loss",
        "loos": "loss",
        "sheet": "sheet",
        "profy": "profit",
        "anb": "and",
    }

    expanded_query = " ".join(synonym_map.get(token, token) for token in query_tokens)
    return expanded_query in normalized_value or any(token in value_tokens for token in expanded_query.split())


def is_likely_header_row(row):
    if not row:
        return False

    cells = [str(cell or "").strip() for cell in row if str(cell or "").strip()]
    if len(cells) < 2:
        return False

    def looks_numeric(cell):
        cleaned = re.sub(r"[^0-9.\-]", "", cell).strip()
        return cleaned != "" and cleaned.replace(".", "").replace("-", "").isdigit()

    def looks_date(cell):
        return bool(re.search(r"\d{2}/\d{2}/\d{4}", cell) or re.search(r"\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b", cell))

    alpha_cells = sum(1 for cell in cells if re.search(r"[A-Za-z]", cell))
    numeric_cells = sum(1 for cell in cells if looks_numeric(cell))
    date_cells = sum(1 for cell in cells if looks_date(cell))

    if date_cells > 0:
        return True
    if alpha_cells >= 2 and numeric_cells < len(cells) and alpha_cells > numeric_cells:
        return True
    return False


def extract_markdown_tables_from_block(block_lines):
    rows = []
    for line in block_lines:
        clean_line = line.strip()
        if not clean_line or not clean_line.startswith("|"):
            continue
        cells = [cell.strip() for cell in clean_line.strip("|").split("|")]
        if len(cells) >= 2:
            rows.append(cells)
    if len(rows) < 2:
        return []

    header_index = 0
    for idx, row in enumerate(rows):
        if is_likely_header_row(row):
            header_index = idx
            break

    header = rows[header_index]
    data_rows = rows[header_index + 1:]
    if not is_likely_header_row(header):
        return []

    separator_row = rows[header_index + 1] if header_index + 1 < len(rows) else []
    if separator_row and len(separator_row) == len(header) and all(re.fullmatch(r":?-+:?", str(cell).strip()) for cell in separator_row):
        data_rows = rows[header_index + 2:]

    return [header] + data_rows


def extract_tables_from_section(section_text):
    tables = []
    if not section_text:
        return tables

    lines = section_text.splitlines()
    i = 0
    while i < len(lines) - 1:
        current_line = lines[i].strip()
        next_line = lines[i + 1].strip()
        if current_line.startswith("|") and re.fullmatch(r"\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?", next_line):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            parsed_rows = extract_markdown_tables_from_block(block)
            if parsed_rows and len(parsed_rows) >= 2:
                tables.append(parsed_rows)
            continue
        i += 1

    html_blocks = re.findall(r"<table\b[^>]*>([\s\S]*?)</table>", section_text, flags=re.IGNORECASE)
    for html_block in html_blocks:
        rows = []
        for row_html in re.findall(r"<tr\b[^>]*>([\s\S]*?)</tr>", html_block, flags=re.IGNORECASE):
            cells = []
            for cell_html in re.findall(r"<(?:th|td)\b[^>]*>([\s\S]*?)</(?:th|td)>", row_html, flags=re.IGNORECASE):
                text = re.sub(r"<[^>]+>", " ", cell_html)
                text = html.unescape(text)
                text = re.sub(r"\s+", " ", text).strip()
                cells.append(text)
            if cells:
                rows.append(cells)
        if rows:
            tables.append(rows)

    cleaned_tables = []
    for table in tables:
        if not table or len(table) < 2:
            continue
        header = table[0]
        if not is_likely_header_row(header):
            continue
        cleaned_tables.append(table)

    merged = []
    for table in cleaned_tables:
        if not merged:
            merged.append(table)
            continue

        previous = merged[-1]
        previous_columns = len(previous[0]) if previous else 0
        current_columns = len(table[0]) if table else 0
        if previous_columns == current_columns and len(previous) >= 2 and len(table) >= 2:
            previous.extend(table[1:])
        else:
            merged.append(table)

    deduped = []
    seen = set()
    for table in merged:
        key = json.dumps(table, ensure_ascii=False)
        if key not in seen:
            deduped.append(table)
            seen.add(key)
    return deduped


def render_section_tables(section):
    tables = extract_tables_from_section(section["content"])
    if not tables:
        st.info(f"No table blocks detected in the '{section['title']}' section.")
        return

    st.subheader(section["title"])

    tab_labels = [f"Table {idx}" for idx in range(1, len(tables) + 1)]
    tabs = st.tabs(tab_labels)

    for idx, table in enumerate(tables):
        with tabs[idx]:
            st.caption(f"Table {idx + 1} from \"{section['title']}\"")
            if not table or len(table) < 2:
                st.write(table)
                continue

            columns = table[0]
            records = []
            for row in table[1:]:
                if len(row) < len(columns):
                    row = row + [""] * (len(columns) - len(row))
                elif len(row) > len(columns):
                    row = row[: len(columns)]
                records.append(dict(zip(columns, row)))

            if records:
                st.dataframe(pd.DataFrame(records), use_container_width=True)
            else:
                st.table(table)


STATEMENT_PRIORITY = [
    "balance sheet",
    "statement of profit and loss",
    "profit and loss",
    "income statement",
    "p&l",
    "cash flow",
    "statement of cash flows",
    "statement of changes in equity",
    "notes to financial statements",
    "statement of changes in equity",
]


def section_match_score(section, query):
    title = section["title"] or ""
    content = section["content"] or ""
    normalized_query = normalize_search_phrase(query)
    normalized_title = normalize_search_phrase(title)
    normalized_content = normalize_search_phrase(content)
    title_lower = title.lower()

    score = 0

    direct_statement_prefixes = [
        "balance sheet",
        "statement of profit and loss",
        "statement of cash flows",
        "cash flow statement",
        "cash flow",
        "statement of changes in equity",
        "profit and loss",
        "income statement",
    ]

    direct_title = re.sub(r"^(?:\[\d+\]\s*|\d+\s+)+", "", normalized_title).strip()
    title_is_direct_statement = any(
        direct_title.startswith(prefix) or direct_title.startswith(f"[{prefix}") or f"[{prefix}" in direct_title
        for prefix in direct_statement_prefixes
    )

    if title_is_direct_statement:
        score += 7000

    if normalized_query and normalized_query == normalized_title:
        score += 5000
    elif normalized_query and normalized_query in normalized_title:
        score += 2500

    if fuzzy_match_text(title, query):
        score += 1200
    if fuzzy_match_text(content, query):
        score += 300

    if normalized_query and normalized_query in normalized_content:
        score += 600

    for idx, statement_name in enumerate(STATEMENT_PRIORITY):
        if statement_name in title_lower:
            score += (len(STATEMENT_PRIORITY) - idx) * 200
            break

    if "|" in content or "table" in title_lower:
        score += 200

    if title_lower.startswith("**[") and "balance sheet" in title_lower:
        score += 150

    if "notes to financial statements" in title_lower or "disclosure in secretarial audit report" in title_lower:
        score -= 500

    if len(title.split()) > 12 and "balance sheet" in title_lower and not title_is_direct_statement:
        score -= 2000
    if "the amount included in the balance sheet" in title_lower:
        score -= 3000

    return score


def find_matching_sections(markdown_text, user_query):
    query = (user_query or "").strip()
    if not query:
        return []

    matches = []

    for section in find_sections(markdown_text):
        score = section_match_score(section, query)
        if score > 0:
            matches.append({"section": section, "score": score})

    matches.sort(key=lambda item: item["score"], reverse=True)
    return [item["section"] for item in matches]


def find_matching_section(markdown_text, user_query):
    matches = find_matching_sections(markdown_text, user_query)
    return matches[0] if matches else None


def get_all_markdown_files():
    candidate_dirs = [
        OUTPUT_DIR,
        Path(__file__).resolve().parent.parent.parent / "output",
    ]
    markdown_files = []
    seen = set()
    for folder in candidate_dirs:
        if not folder.exists():
            continue
        for file_path in sorted(folder.glob("**/*.md")):
            if file_path.name in seen:
                continue
            markdown_files.append(file_path)
            seen.add(file_path.name)
    return markdown_files


def show_matching_sections(markdown_text, query):
    if markdown_text:
        matches = find_matching_sections(markdown_text, query)
        if matches:
            st.success(f"Found {len(matches)} matching section(s) in the current document.")
            for index, match in enumerate(matches[:3], start=1):
                st.markdown(f"### {index}. {match['title']}")
                tables = extract_tables_from_section(match["content"])
                if tables:
                    tab_labels = [f"Table {idx}" for idx in range(1, len(tables) + 1)]
                    tabs = st.tabs(tab_labels)
                    for idx, table in enumerate(tables):
                        with tabs[idx]:
                            st.caption(f"Match result {index} · {match['title']}")
                            headers = table[0]
                            rows = [dict(zip(headers, row)) for row in table[1:]]
                            st.dataframe(pd.DataFrame(rows, columns=headers), use_container_width=True)
                    return
                st.write(match["content"][:4000] + ("..." if len(match["content"]) > 4000 else ""))
                return

    markdown_files = get_all_markdown_files()
    if not markdown_files:
        st.warning("No parsed markdown files were found in the output folders yet.")
        return

    ranked = []
    for file_path in markdown_files:
        file_text = file_path.read_text(encoding="utf-8", errors="ignore")
        for section in find_sections(file_text):
            score = section_match_score(section, query)
            if score > 0:
                ranked.append({"file": file_path.name, "section": section, "score": score})

    if not ranked:
        st.warning(f"No matching section found for: {query or 'empty search'}")
        return

    ranked.sort(key=lambda item: item["score"], reverse=True)
    best = ranked[0]
    st.success(f"Best match found in {best['file']}.")
    st.markdown(f"### {best['section']['title']}")
    tables = extract_tables_from_section(best["section"]["content"])
    if tables:
        tab_labels = [f"Table {idx}" for idx in range(1, len(tables) + 1)]
        tabs = st.tabs(tab_labels)
        for idx, table in enumerate(tables):
            with tabs[idx]:
                st.caption(f"Source: {best['file']} · {best['section']['title']}")
                headers = table[0]
                rows = [dict(zip(headers, row)) for row in table[1:]]
                st.dataframe(pd.DataFrame(rows, columns=headers), use_container_width=True)
    else:
        st.write(best["section"]["content"][:4000] + ("..." if len(best["section"]["content"]) > 4000 else ""))


def main():
    st.set_page_config(page_title="Financial PDF Analyzer", layout="wide")
    st.title("Balance Sheet / Profit & Loss PDF Analyzer")
    st.caption("Upload a PDF, parse it with LlamaCloud, then search the already-parsed markdown for the exact section table you want to inspect in its own tab.")

    for key in ["parsed_markdown", "parsed_output_file", "parsed_source", "current_upload_name"]:
        if key not in st.session_state:
            st.session_state[key] = None

    api_key = load_project_env()
    if api_key:
        st.success("LLAMA_CLOUD_API_KEY loaded from balancesheet_backend/.env")
    else:
        st.warning("No LLAMA_CLOUD_API_KEY found in balancesheet_backend/.env")

    uploaded_file = st.file_uploader("Upload a PDF report", type=["pdf"])

    if uploaded_file is not None:
        ensure_folders()
        target_path = UPLOAD_DIR / uploaded_file.name
        target_path.write_bytes(uploaded_file.read())
        st.write(f"Saved upload to: {target_path}")

        if st.session_state.current_upload_name != uploaded_file.name:
            st.session_state.current_upload_name = uploaded_file.name
            st.session_state.parsed_markdown = None
            st.session_state.parsed_output_file = None
            st.session_state.parsed_source = None

        with st.form("parse_pdf_form", clear_on_submit=False):
            parse_clicked = st.form_submit_button("Parse PDF and cache the markdown", type="primary")
            if parse_clicked:
                try:
                    with st.spinner("Checking cached PDF hash and parsing if needed..."):
                        markdown_text, output_file, source = parse_pdf_and_extract(target_path)

                    st.session_state.parsed_markdown = markdown_text
                    st.session_state.parsed_output_file = output_file
                    st.session_state.parsed_source = source

                    if source == "db-hit":
                        st.info("Reusing the existing Supabase markdown for this PDF hash.")
                    else:
                        st.success("Parsed markdown is ready for section lookup.")
                except Exception as exc:
                    st.error(f"Parsing failed: {exc}")

        if st.session_state.parsed_markdown:
            st.info("Parsed markdown is already cached for this PDF. Use the keyword box below to inspect a matching table without reloading the PDF.")
            st.markdown("## Search extracted section")
            st.caption("Type a keyword such as balance sheet, profit and loss, liabilities, assets, cash flow, or notes to financial statements and click Get table details.")

            with st.form("search_section_form", clear_on_submit=False):
                search_query = st.text_input("Section or table keyword", placeholder="Try: balance sheet, p&l, liabilities, assets, cash flow", key="search_query")
                search_clicked = st.form_submit_button("Get table details", type="primary")
                if search_clicked:
                    show_matching_sections(st.session_state.get("parsed_markdown"), search_query)


if __name__ == "__main__":
    main()
