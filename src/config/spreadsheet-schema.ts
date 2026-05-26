import { COL, TOTAL_COLUMNS, LEDGER_HEADERS, SHEETS, TYPE_TO_SHEET, TYPE_SHEET_COL, TYPE_SHEET_TOTAL_COLUMNS } from './index';

export { COL, TOTAL_COLUMNS, LEDGER_HEADERS, SHEETS, TYPE_TO_SHEET, TYPE_SHEET_COL, TYPE_SHEET_TOTAL_COLUMNS };

export const SHEET_NAME = SHEETS.LEDGER;
export const COLUMN_HEADERS = LEDGER_HEADERS;

export function columnToLetter(col: number): string {
  let letter = '';
  let c = col;
  while (c > 0) {
    const mod = (c - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    c = Math.floor((c - 1) / 26);
  }
  return letter;
}

export type ColumnIndex = Record<string, number>;

export const getColumnIndex = (): ColumnIndex => {
  return COLUMN_HEADERS.reduce((acc, header, idx) => {
    acc[header] = idx + 1; // 1-based
    return acc;
  }, {} as ColumnIndex);
};
