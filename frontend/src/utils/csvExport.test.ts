import { describe, expect, it } from 'vitest';
import { csvCell, rowsToCsv } from './csvExport';

describe('CSV export', () => {
  it('escapes commas, quotes, and newlines', () => {
    expect(csvCell('A, "quoted"\nvalue')).toBe('"A, ""quoted""\nvalue"');
  });

  it('serializes authoritative rows with CRLF records', () => {
    expect(rowsToCsv(['ID', 'Title'], [['RES-1', 'Board, review']]))
      .toBe('ID,Title\r\nRES-1,"Board, review"');
  });
});
