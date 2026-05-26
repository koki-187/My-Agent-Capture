import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

// ===== 列定義 (1-based, A=1) =====
export const COL = {
  ACCEPTED_AT: 1,      // A: 受付日
  CASE_ID: 2,          // B: 案件ID (MAC-YYYYMMDD-XXXX)
  NAME: 3,             // C: 物件名
  TYPE: 4,             // D: 種別
  AREA: 5,             // E: エリア
  ADDRESS: 6,          // F: 所在地
  PRICE: 7,            // G: 金額_万円
  MARKET_TSUBO: 8,     // H: 市場坪単価_万円
  MARKET_VERDICT: 9,   // I: 市場比較
  TAX_CATEGORY: 10,    // J: 金額_消費税
  PRICE_CONDITION: 11, // K: 金額_条件
  LAND_M2: 12,         // L: 土地面積_m2
  BLDG_M2: 13,         // M: 建物面積_m2
  STATION: 14,         // N: 最寄り駅
  WALK_MIN: 15,        // O: 徒歩_分
  YOUTO: 16,           // P: 用途地域_区分
  KENPEI: 17,          // Q: 建蔽率_%
  YOSEKI: 18,          // R: 容積率_%
  TSUBO: 19,           // S: 坪単価_万円
  TSUBO_TYPE: 20,      // T: 坪単価_種別
  RENT_YR: 21,         // U: 現況賃料_月
  YIELD: 22,           // V: 表面利回り_%
  MEMO: 23,            // W: 備考
  FOLDER_URL: 24,      // X: DriveフォルダURL
  STATUS: 25,          // Y: 案件ステータス
  SOURCE: 26,          // Z: 情報源
  OVERVIEW_URL: 27,    // AA: 概要書PDF_URL
  FILE_URL: 28,        // AB: 元ファイルURL
} as const;

export const TOTAL_COLUMNS = 28; // A~AB

// ===== 台帳ヘッダー =====
export const LEDGER_HEADERS: string[] = [
  '受付日', '案件ID', '物件名', '種別', 'エリア', '所在地',
  '金額_万円', '市場坪単価_万円', '市場比較',
  '金額_消費税', '金額_条件', '土地面積_m2', '建物面積_m2',
  '最寄り駅', '徒歩_分', '用途地域_区分', '建蔽率_%', '容積率_%',
  '坪単価_万円', '坪単価_種別', '現況賃料_月', '表面利回り_%',
  '備考', 'DriveフォルダURL', '案件ステータス', '情報源',
  '概要書PDF_URL', '元ファイルURL',
];

// ===== 種別シート列定義 (A~J 10列) =====
export const TYPE_SHEET_COL = {
  ACCEPTED_AT: 1,    // A: 受付日
  CASE_ID: 2,        // B: 案件ID
  NAME: 3,           // C: 物件名
  ADDRESS: 4,        // D: 所在地
  PRICE: 5,          // E: 金額
  LAND_AREA: 6,      // F: 土地面積
  STATION: 7,        // G: 最寄り駅
  WALK: 8,           // H: 徒歩
  OVERVIEW_PDF: 9,   // I: 概要書PDF
  STATUS: 10,        // J: ステータス
} as const;
export const TYPE_SHEET_TOTAL_COLUMNS = 10;

// ===== 処理ログ列定義 (A~D 4列) =====
export const LOG_COL = {
  TIMESTAMP: 1,  // A: 日付
  LEVEL: 2,      // B: レベル
  MESSAGE: 3,    // C: メッセージ
  FILENAME: 4,   // D: ファイル名
} as const;
export const LOG_TOTAL_COLUMNS = 4;

// ===== シート名 =====
export const SHEETS = {
  LEDGER: '案件表_台帳',
  LOG: '処理ログ',
  SETTINGS: '設定',
} as const;

// ===== 種別→シート名マッピング =====
export const TYPE_TO_SHEET: Record<string, string> = {
  '戸建て': '戸建て',
  '古家あり': '古家あり',
  '低層マンション': '低層マンション',
  '一棟レジデンス': '一棟レジデンス',
  '一棟ビル': '一棟ビル',
  '空き地': '空き地',
  'ロードサイド付き使用地': 'ロードサイド付き使用地',
  '中古マンション': '中古マンション',
};

// ===== 種別サブタブ (土地の場合) =====
export function getLandSubTab(landAreaM2: number | null, zoningUse: string): string {
  if (landAreaM2 !== null && landAreaM2 >= 1000) return '戸建て（マンション用地）';
  if (landAreaM2 !== null && landAreaM2 >= 200) return '戸建て（アパート用地）';
  if (zoningUse && /第[一二]種商業地域/.test(zoningUse)) return '戸建て（商業用地）';
  return '戸建て';
}

// ===== 案件IDフォーマット =====
export const CASE_ID_PREFIX = 'MAC';
export const CASE_ID_FORMAT = /^MAC-\d{8}-\d{4}$/;

// ===== 物件種別マッピング (表記ゆれ対応) =====
export const PROPERTY_TYPE_MAP: Record<string, string> = {
  '戸建て': '戸建て',
  '戸建': '戸建て',
  '一戸建て': '戸建て',
  '一戸建': '戸建て',
  '古家': '古家あり',
  '古家あり': '古家あり',
  'マンション': '中古マンション',
  '中古マンション': '中古マンション',
  '低層マンション': '低層マンション',
  '一棟マンション': '一棟レジデンス',
  '一棟レジデンス': '一棟レジデンス',
  '一棟ビル': '一棟ビル',
  'ビル': '一棟ビル',
  '土地': '空き地',
  '空き地': '空き地',
  '更地': '空き地',
  'ロードサイド': 'ロードサイド付き使用地',
  'ロードサイド付き使用地': 'ロードサイド付き使用地',
};

// ===== M2→坪換算 =====
export const M2_TO_TSUBO = 3.30583;

// ===== API設定 =====
export const API_CONFIG = {
  GEMINI_MODEL: 'gemini-2.5-flash',
  GSI_GEOCODER_URL: 'https://msearch.gsi.go.jp/address-search/AddressSearch',
  HEARTTRAILS_URL: 'https://express.hearttrails.com/api/json',
  NLFTP_URL: 'https://nlftp.mlit.go.jp/ksj/api/1.0',
  GEOCODE_WAIT_MS: 2100,
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY_MS: 1000,
} as const;

// ===== 環境変数ヘルパー =====
export function getEnv(key: string, required = false): string {
  const value = process.env[key] ?? '';
  if (required && !value) {
    throw new Error(`必須環境変数 ${key} が未設定です。.envファイルを確認してください。`);
  }
  return value;
}

// ===== ENV オブジェクト =====
export const ENV = {
  get SPREADSHEET_ID() { return getEnv('GOOGLE_SPREADSHEET_ID', true); },
  get SERVICE_ACCOUNT_KEY_PATH() { return getEnv('GOOGLE_SERVICE_ACCOUNT_KEY_PATH', true); },
  get DRIVE_ROOT_FOLDER_ID() { return getEnv('GOOGLE_DRIVE_ROOT_FOLDER_ID', true); },
  get GEMINI_API_KEY() { return getEnv('GEMINI_API_KEY', true); },
  get LINE_CHANNEL_ACCESS_TOKEN() { return getEnv('LINE_CHANNEL_ACCESS_TOKEN', true); },
  get LINE_CHANNEL_SECRET() { return getEnv('LINE_CHANNEL_SECRET', true); },
  get GOOGLE_MAPS_API_KEY() { return getEnv('GOOGLE_MAPS_API_KEY'); },
  get MLIT_API_KEY() { return getEnv('MLIT_API_KEY'); },
  get AGENT_NAME() { return getEnv('AGENT_NAME') || '担当者名'; },
  get COMPANY_NAME() { return getEnv('COMPANY_NAME') || '会社名'; },
  get WEBHOOK_URL() { return getEnv('WEBHOOK_URL') || ''; },
  get PORT() { return parseInt(getEnv('PORT') || '3000', 10); },
  get LOG_LEVEL() { return getEnv('LOG_LEVEL') || 'info'; },
  get SOURCE_OPTIONS(): string[] {
    const raw = getEnv('SOURCE_OPTIONS');
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : ['紹介', '仲介', '買取'];
  },
};

// ===== サービスアカウントJSON読み込み =====
export function loadServiceAccountKey(): object {
  const keyPath = ENV.SERVICE_ACCOUNT_KEY_PATH;
  const resolvedPath = path.resolve(process.cwd(), keyPath);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(resolvedPath);
  } catch {
    throw new Error(`サービスアカウントJSONが見つかりません: ${resolvedPath}`);
  }
}
