import { google, sheets_v4 } from 'googleapis';
import { format } from 'date-fns';
import { ENV, COL, TOTAL_COLUMNS, LEDGER_HEADERS, SHEETS, TYPE_TO_SHEET, TYPE_SHEET_COL, TYPE_SHEET_TOTAL_COLUMNS, CASE_ID_PREFIX, loadServiceAccountKey } from '../config';
import { PropertyListing, CaseStatus, ProcessLog, OcrExtractedData } from '../types/property';
import logger from '../utils/logger';

let _sheetsClient: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (!_sheetsClient) {
    const key = loadServiceAccountKey() as any;
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: key.client_email,
        private_key: key.private_key,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    _sheetsClient = google.sheets({ version: 'v4', auth });
  }
  return _sheetsClient;
}

function columnToLetter(col: number): string {
  let letter = '';
  let c = col;
  while (c > 0) {
    const mod = (c - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    c = Math.floor((c - 1) / 26);
  }
  return letter;
}

function str(row: any[], i: number): string {
  return (row[i - 1] || '').toString().trim();
}

function num(row: any[], i: number): number | null {
  const raw = str(row, i).replace(/[万円㎡%、,\s]/g, '');
  const v = parseFloat(raw);
  return isNaN(v) ? null : v;
}

function dt(row: any[], i: number): Date | null {
  const s = str(row, i);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function rowToListing(row: any[], rowNum: number): PropertyListing {
  return {
    rowNum,
    acceptedAt: dt(row, COL.ACCEPTED_AT),
    caseId: str(row, COL.CASE_ID),
    propertyName: str(row, COL.NAME),
    propertyType: str(row, COL.TYPE),
    area: str(row, COL.AREA),
    address: str(row, COL.ADDRESS),
    priceMlanEn: num(row, COL.PRICE),
    marketTsuboPrice: num(row, COL.MARKET_TSUBO),
    marketVerdict: str(row, COL.MARKET_VERDICT),
    taxCategory: str(row, COL.TAX_CATEGORY),
    priceCondition: str(row, COL.PRICE_CONDITION),
    landAreaM2: num(row, COL.LAND_M2),
    buildingAreaM2: num(row, COL.BLDG_M2),
    nearestStation: str(row, COL.STATION),
    walkMinutes: num(row, COL.WALK_MIN),
    zoningUse: str(row, COL.YOUTO),
    coverageRatio: num(row, COL.KENPEI),
    floorAreaRatio: num(row, COL.YOSEKI),
    tsuboPrice: num(row, COL.TSUBO),
    tsuboPriceType: str(row, COL.TSUBO_TYPE),
    currentRentYen: num(row, COL.RENT_YR),
    grossYield: num(row, COL.YIELD),
    notes: str(row, COL.MEMO),
    driveFolderUrl: str(row, COL.FOLDER_URL),
    caseStatus: str(row, COL.STATUS) as CaseStatus || '新規',
    infoSource: str(row, COL.SOURCE),
    overviewPdfUrl: str(row, COL.OVERVIEW_URL),
    fileUrl: str(row, COL.FILE_URL),
  };
}

export async function validateHeaders(): Promise<boolean> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ENV.SPREADSHEET_ID,
    range: `${SHEETS.LEDGER}!A1:${columnToLetter(TOTAL_COLUMNS)}1`,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const actual = res.data.values?.[0] || [];
  let valid = true;
  LEDGER_HEADERS.forEach((expected, i) => {
    if (actual[i] !== expected) {
      logger.warn(`ヘッダー不一致: 列${i + 1} 期待="${expected}" 実際="${actual[i] || '(空)'}"`);
      valid = false;
    }
  });

  if (valid) logger.info(`台帳ヘッダーOK (${LEDGER_HEADERS.length}列)`);
  return valid;
}

export async function getAllListings(): Promise<PropertyListing[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ENV.SPREADSHEET_ID,
    range: `${SHEETS.LEDGER}!A2:${columnToLetter(TOTAL_COLUMNS)}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const rows = res.data.values || [];
  return rows.map((row, i) => rowToListing(row, i + 2));
}

export async function getListingByCaseId(caseId: string): Promise<PropertyListing | null> {
  const listings = await getAllListings();
  return listings.find(l => l.caseId === caseId) || null;
}

export async function appendListing(data: Partial<PropertyListing>, ocr?: OcrExtractedData): Promise<{ rowNum: number; caseId: string }> {
  const sheets = getSheetsClient();
  const caseId = data.caseId || await generateCaseId(sheets);
  const nowDate = format(new Date(), 'yyyy/MM/dd');

  const fmtNum = (v: number | null | undefined, suffix: string) => v != null ? `${v.toLocaleString()}${suffix}` : '';
  const fmtPct = (v: number | null | undefined) => v != null ? `${v}%` : '';

  const row = new Array(TOTAL_COLUMNS).fill('');
  row[COL.ACCEPTED_AT - 1] = nowDate;
  row[COL.CASE_ID - 1] = caseId;
  row[COL.NAME - 1] = data.propertyName || ocr?.propertyName || '';
  row[COL.TYPE - 1] = data.propertyType || ocr?.propertyType || '';
  row[COL.AREA - 1] = data.area || ocr?.area || '';
  row[COL.ADDRESS - 1] = data.address || ocr?.address || '';
  row[COL.PRICE - 1] = fmtNum(data.priceMlanEn ?? ocr?.priceMlanEn, '万円');
  row[COL.MARKET_TSUBO - 1] = fmtNum(data.marketTsuboPrice, '万円');
  row[COL.MARKET_VERDICT - 1] = data.marketVerdict || '';
  row[COL.TAX_CATEGORY - 1] = data.taxCategory || ocr?.taxCategory || '';
  row[COL.PRICE_CONDITION - 1] = data.priceCondition || ocr?.priceCondition || '';
  row[COL.LAND_M2 - 1] = fmtNum(data.landAreaM2 ?? ocr?.landAreaM2, '㎡');
  row[COL.BLDG_M2 - 1] = fmtNum(data.buildingAreaM2 ?? ocr?.buildingAreaM2, '㎡');
  row[COL.STATION - 1] = data.nearestStation || ocr?.nearestStation || '';
  row[COL.WALK_MIN - 1] = (data.walkMinutes ?? ocr?.walkMinutes) != null ? `${data.walkMinutes ?? ocr?.walkMinutes}分` : '';
  row[COL.YOUTO - 1] = data.zoningUse || ocr?.zoningUse || '';
  row[COL.KENPEI - 1] = fmtPct(data.coverageRatio ?? ocr?.coverageRatio);
  row[COL.YOSEKI - 1] = fmtPct(data.floorAreaRatio ?? ocr?.floorAreaRatio);
  row[COL.TSUBO - 1] = fmtNum(data.tsuboPrice, '万円/坪');
  row[COL.TSUBO_TYPE - 1] = data.tsuboPriceType || '';
  row[COL.RENT_YR - 1] = fmtNum(data.currentRentYen ?? ocr?.currentRentYen, '万円/月');
  row[COL.YIELD - 1] = fmtPct(data.grossYield);
  row[COL.MEMO - 1] = data.notes || ocr?.notes || '';
  row[COL.FOLDER_URL - 1] = data.driveFolderUrl || '';
  row[COL.STATUS - 1] = data.caseStatus || '新規';
  row[COL.SOURCE - 1] = data.infoSource || '';
  row[COL.OVERVIEW_URL - 1] = data.overviewPdfUrl || '';
  row[COL.FILE_URL - 1] = data.fileUrl || '';

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: ENV.SPREADSHEET_ID,
    range: `${SHEETS.LEDGER}!A:${columnToLetter(TOTAL_COLUMNS)}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  const updatedRange = res.data.updates?.updatedRange || '';
  const match = updatedRange.match(/(\d+)$/);
  const rowNum = match ? parseInt(match[1], 10) : -1;

  logger.info(`台帳に追加: ${caseId} (行${rowNum})`);
  return { rowNum, caseId };
}

export async function updateCell(rowNum: number, colNum: number, value: string | number): Promise<void> {
  const sheets = getSheetsClient();
  const range = `${SHEETS.LEDGER}!${columnToLetter(colNum)}${rowNum}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: ENV.SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

export async function updateCells(updates: { rowNum: number; colNum: number; value: string | number }[]): Promise<void> {
  if (updates.length === 0) return;
  const sheets = getSheetsClient();
  const data = updates.map(u => ({
    range: `${SHEETS.LEDGER}!${columnToLetter(u.colNum)}${u.rowNum}`,
    values: [[u.value]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: ENV.SPREADSHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

export async function writeLog(log: ProcessLog): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: ENV.SPREADSHEET_ID,
    range: `${SHEETS.LOG}!A:D`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        format(log.timestamp, 'yyyy/MM/dd HH:mm:ss'),
        log.level,
        log.message,
        log.fileName,
      ]],
    },
  });
}

let _idLockChain: Promise<void> = Promise.resolve();

async function generateCaseId(sheets: sheets_v4.Sheets): Promise<string> {
  let unlock!: () => void;
  const acquired = new Promise<void>(resolve => { unlock = resolve; });
  _idLockChain = _idLockChain.then(() => acquired);
  try {
    const today = format(new Date(), 'yyyyMMdd');
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: ENV.SPREADSHEET_ID,
      range: `${SHEETS.LEDGER}!B:B`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const allIds = (res.data.values || []).flat().filter(Boolean);
    const todaysIds = allIds
      .filter((id: string) => id.startsWith(`${CASE_ID_PREFIX}-${today}-`))
      .map((id: string) => {
        const parts = id.split('-');
        const seq = parseInt(parts[2], 10);
        return isNaN(seq) ? 0 : seq;
      })
      .filter((seq: number) => seq > 0);
    const nextSeq = todaysIds.length > 0 ? Math.max(...todaysIds) + 1 : 1;
    return `${CASE_ID_PREFIX}-${today}-${String(nextSeq).padStart(4, '0')}`;
  } finally {
    unlock();
  }
}
