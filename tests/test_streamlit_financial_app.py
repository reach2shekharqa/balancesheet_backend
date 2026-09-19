from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "poc"))

import streamlit_financial_app as app


def test_find_matching_sections_matches_balance_sheet_heading():
    markdown = '''
# KMC SPECIALITY HOSPITALS (INDIA) LIMITED
**Balance sheet as at March 31, 2025**
| Particulars | Amount |
| --- | --- |
| Assets | 1,000 |

## Statement of profit and loss for the year ended March 31, 2025
| Particulars | Amount |
| --- | --- |
| Revenue | 2,000 |
'''

    matches = app.find_matching_sections(markdown, "Balance sheet as at March 31, 2025")

    assert len(matches) >= 1
    assert "balance sheet" in matches[0]["title"].lower()


def test_extract_tables_from_section_collects_markdown_blocks():
    section = '''
### Balance sheet as at March 31, 2025
| Particulars | Note | Amount |
| --- | --- | --- |
| Assets | 1 | 100 |
| Liabilities | 2 | 90 |
'''

    tables = app.extract_tables_from_section(section)

    assert len(tables) == 1
    assert tables[0][0] == ["Particulars", "Note", "Amount"]
    assert tables[0][1] == ["Assets", "1", "100"]


def test_find_matching_sections_matches_bold_title_before_markdown_table():
    markdown = '''
**KMC SPECIALITY HOSPITALS (INDIA) LIMITED**
**Balance sheet as at March 31, 2025**
*(All amounts are in Indian Rupees Lakhs)*

| Particulars | Note | As at March 31, 2025 | As at March 31, 2024 |
| --- | --- | --- | --- |
| Assets |  | 28,599.86 | 26,371.55 |
| Liabilities |  | 12,166.77 | 12,013.58 |

**Statement of profit and loss for the year ended March 31, 2025**
| Particulars | Amount |
| --- | --- |
| Revenue | 15,000 |
'''

    matches = app.find_matching_sections(markdown, "Balance sheet as at March 31, 2025")

    assert len(matches) >= 1
    assert "Balance sheet as at March 31, 2025" in matches[0]["title"]
    tables = app.extract_tables_from_section(matches[0]["content"])
    assert len(tables) == 1
    assert any("Assets" in row for row in tables[0])


def test_extract_tables_from_section_ignores_wrapped_mid_table_separator_blocks():
    section = '''
# **[110000] Balance sheet**

|                                                     | 31/03/2025 | 31/03/2024 | 31/03/2023 |
| --------------------------------------------------- | ---------- | ---------- | ---------- |
| Balance sheet [Abstract]                           |            |            |            |
| Assets [Abstract]                                  |            |            |            |
| Property, plant and equipment                       | 1,419.47   | 1,264.46   | 1,322.48   |
| Current liabilities [Abstract]                     |            |            |            |
| Provisions, current                                | 0          | 0          |            |
| --------------------------------------------------- | ---------- | ---------- | ---------- |
| Current tax liabilities                            | 0          | 0          |            |
| Total current liabilities                          | 2,733.65   | 643.97     |            |
| Total liabilities                                  | 2,993      | 1,545.29   |            |
'''

    tables = app.extract_tables_from_section(section)

    assert len(tables) == 1
    assert tables[0][0] == ["", "31/03/2025", "31/03/2024", "31/03/2023"]
    assert any("Current tax liabilities" in row for row in tables[0])
