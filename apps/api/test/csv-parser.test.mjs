// Story 6-5: csv-parser unit tests. The parser is hand-rolled (no
// csv-parse dep) so the edge-case coverage matters more than usual —
// every input it accepts has to survive the AC6 single-transaction
// commit, and every input it rejects must surface as a clean
// structured error (AC5).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseCsv, CsvParseError } = await import('../dist/identity/csv-parser.js');

test('parses a simple comma-separated CSV with header + data row', () => {
  const csv = 'email,display_name\njdoe@x.com,Jane Doe\n';
  assert.deepEqual(parseCsv(csv), [
    ['email', 'display_name'],
    ['jdoe@x.com', 'Jane Doe'],
  ]);
});

test('handles missing trailing newline', () => {
  const csv = 'a,b\n1,2';
  assert.deepEqual(parseCsv(csv), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('normalizes CRLF to LF', () => {
  const csv = 'a,b\r\n1,2\r\n';
  assert.deepEqual(parseCsv(csv), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('strips UTF-8 BOM', () => {
  const csv = '﻿a,b\n1,2\n';
  const rows = parseCsv(csv);
  assert.equal(rows[0][0], 'a', 'BOM must not leak into the first cell');
});

test('preserves embedded commas inside a quoted field', () => {
  // The roster CSV's display_name may be "Doe, Jane" with a comma.
  // The parser MUST treat the field as one cell, not two.
  const csv = 'email,display_name\njdoe@x.com,"Doe, Jane"\n';
  assert.deepEqual(parseCsv(csv), [
    ['email', 'display_name'],
    ['jdoe@x.com', 'Doe, Jane'],
  ]);
});

test('handles escaped double-quotes inside a quoted field', () => {
  // RFC 4180 §2.7: a literal `"` inside a quoted field is `""`.
  const csv = 'a,b\n"She said ""hi""",1\n';
  assert.deepEqual(parseCsv(csv), [
    ['a', 'b'],
    ['She said "hi"', '1'],
  ]);
});

test('produces empty cells for adjacent commas', () => {
  const csv = 'a,b,c\n1,,3\n';
  assert.deepEqual(parseCsv(csv), [
    ['a', 'b', 'c'],
    ['1', '', '3'],
  ]);
});

test('rejects an unterminated quoted field at end of input', () => {
  // A roster CSV with a stray opening quote that reaches EOF: the
  // parser must NOT silently swallow the rest of the file as one
  // giant field. Note: a `\n` inside the quote falls under the
  // separate "multi-line quoted field" branch (see the next test);
  // this case exercises the EOF branch specifically.
  const csv = 'a,b\n"unterminated';
  let threw = false;
  try {
    parseCsv(csv);
  } catch (err) {
    threw = true;
    assert.ok(err instanceof CsvParseError, 'expected CsvParseError');
    assert.match(err.message, /unterminated/);
  }
  assert.ok(threw);
});

test('rejects an unescaped quote inside an unquoted field', () => {
  const csv = 'a,b\njdoe@x.com,Jane"Doe\n';
  let threw = false;
  try {
    parseCsv(csv);
  } catch (err) {
    threw = true;
    assert.ok(err instanceof CsvParseError);
    assert.match(err.message, /unescaped quote/);
  }
  assert.ok(threw);
});

test('rejects literal newline inside a quoted field (multi-line records unsupported)', () => {
  const csv = 'a,b\n"first\nline",1\n';
  let threw = false;
  try {
    parseCsv(csv);
  } catch (err) {
    threw = true;
    assert.ok(err instanceof CsvParseError);
    assert.match(err.message, /multi-line/);
  }
  assert.ok(threw);
});

test('empty input produces zero rows', () => {
  assert.deepEqual(parseCsv(''), []);
});

test('throws when input is not a string', () => {
  let threw = false;
  try {
    parseCsv(null);
  } catch (err) {
    threw = true;
    assert.ok(err instanceof CsvParseError);
  }
  assert.ok(threw);
});

test('line counter advances correctly across rows for error reporting', () => {
  // The CsvParseError carries the line number. If the parser loses
  // track of newlines, the operator's error report points at the
  // wrong row — a worst-case kind of report bug.
  const csv = 'a,b\n1,2\n"unterminated\n';
  let line = null;
  try {
    parseCsv(csv);
  } catch (err) {
    if (err instanceof CsvParseError) line = err.line;
  }
  // After two newlines we're on line 3; the open-quote opens on line 3.
  assert.equal(line, 3, `expected line=3, got ${line}`);
});
