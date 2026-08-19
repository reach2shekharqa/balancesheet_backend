import fs from "node:fs/promises";

/**
 * Reads a parsed Markdown document.
 *
 * Responsibility:
 * - Read the MD file
 * - Validate the content
 * - Return a normalized document object
 *
 * This module does NOT:
 * - parse tables
 * - detect sections
 * - map financial metrics
 * - resolve years
 * - access the database
 */

export async function readMarkdownFile(filePath) {
    if (!filePath || typeof filePath !== "string") {
        throw new TypeError("A valid Markdown file path is required.");
    }

    try {
        const content = await fs.readFile(filePath, "utf8");

        if (!content.trim()) {
            throw new Error(`Markdown file is empty: ${filePath}`);
        }

        return {
            filePath,
            content,
            lineCount: content.split(/\r?\n/).length,
            characterCount: content.length
        };
    } catch (error) {
        throw new Error(
            `Unable to read Markdown file "${filePath}": ${error.message}`
        );
    }
}