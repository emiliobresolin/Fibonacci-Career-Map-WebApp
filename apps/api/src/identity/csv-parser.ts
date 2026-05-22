/**
 * Small RFC 4180-lite CSV parser (Story 6-5).
 *
 * Why hand-rolled: the only place CSV parsing happens in FCM is the
 * employee-roster bulk import. Adding csv-parse to dependencies for
 * one consumer trades simplicity for capability we don't need —
 * streaming, async transforms, custom delimiters, header inference.
 * The roster CSV is a fixed-shape, finite-size, in-memory blob.
 *
 * What this parser handles (the actually-load-bearing subset of RFC 4180):
 *   • Comma-separated fields
 *   • Quoted fields with embedded commas: `"Doe, Jane",jdoe@x.com,...`
 *   • Escaped double-quotes inside quoted fields: `"She said ""hi"""`
 *   • CRLF and LF line endings
 *   • BOM at the start of the file
 *   • Empty fields between commas
 *
 * What it does NOT support (and a roster CSV must not use):
 *   • Custom delimiters (tab, semicolon)
 *   • Multi-line quoted fields containing literal newlines
 *   • Comments / quoted column headers with unusual whitespace
 *
 * The parser is strict by default — any malformed quoting raises
 * `CsvParseError` carrying the line number for the structured error
 * report Story 6-5 AC5 mandates.
 */

export class CsvParseError extends Error {
  readonly line: number;
  readonly code = 'CSV_PARSE_ERROR' as const;

  constructor(message: string, line: number) {
    super(`CSV parse error on line ${line}: ${message}`);
    this.name = 'CsvParseError';
    this.line = line;
    Object.setPrototypeOf(this, CsvParseError.prototype);
  }
}

/** Parse a CSV blob into an array of row-arrays. The first row is
 *  returned alongside the data rows; callers separate the header
 *  themselves (so they own the column-name validation). */
export function parseCsv(input: string): string[][] {
  if (typeof input !== 'string') {
    throw new CsvParseError('input must be a string', 0);
  }
  // Strip UTF-8 BOM. Excel and some Windows editors prepend it.
  let src = input.startsWith('﻿') ? input.slice(1) : input;
  // Normalize CRLF → LF so the state machine only watches for one
  // line-terminator. We don't support records that span literal
  // newlines (see header doc), so the simplification is safe.
  src = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rows: string[][] = [];
  let cursor = 0;
  let line = 1;
  // Process one row at a time. An empty source produces zero rows.
  while (cursor < src.length) {
    const row: string[] = [];
    let field = '';
    let inQuotes = false;
    let endedByNewline = false;
    while (cursor < src.length) {
      const ch = src[cursor]!;
      if (inQuotes) {
        if (ch === '"') {
          // Look at the next char to disambiguate end-of-field vs.
          // escaped-double-quote ("").
          if (src[cursor + 1] === '"') {
            field += '"';
            cursor += 2;
          } else {
            inQuotes = false;
            cursor += 1;
          }
        } else if (ch === '\n') {
          // Literal newline inside a quoted field — explicitly rejected.
          throw new CsvParseError('multi-line quoted fields are not supported', line);
        } else {
          field += ch;
          cursor += 1;
        }
      } else if (ch === '"') {
        // Quotes are only meaningful at the START of a field. A quote
        // in the middle of an unquoted field is treated as a literal.
        if (field.length === 0) {
          inQuotes = true;
          cursor += 1;
        } else {
          throw new CsvParseError('unescaped quote inside an unquoted field', line);
        }
      } else if (ch === ',') {
        row.push(field);
        field = '';
        cursor += 1;
      } else if (ch === '\n') {
        // Skip pushing on a completely blank line so trailing newlines
        // don't produce phantom rows. A line with explicit empty fields
        // (e.g. ",,," ) still pushes those cells because row.length > 0
        // by the time we reach the newline.
        if (!(row.length === 0 && field === '')) {
          row.push(field);
        }
        field = '';
        cursor += 1;
        line += 1;
        endedByNewline = true;
        break;
      } else {
        field += ch;
        cursor += 1;
      }
    }
    // End-of-input branch. Only runs when we exited the inner loop
    // because we ran out of input — NOT when we exited via newline.
    // (The newline branch already pushed the final cell of that row.)
    if (!endedByNewline) {
      if (inQuotes) {
        throw new CsvParseError('unterminated quoted field at end of input', line);
      }
      if (field.length > 0 || row.length > 0) {
        row.push(field);
      }
    }
    if (row.length > 0) {
      rows.push(row);
    }
  }
  return rows;
}
