// ===== 物件種別 =====
export type PropertyType =
  | '戸建て'
  | '古家あり'
  | '低層マンション'
  | '一棟レジデンス'
  | '一棟ビル'
  | '空き地'
  | 'ロードサイド付き使用地'
  | '中古マンション';

// ===== 案件ステータス =====
export type CaseStatus =
  | '新規'
  | '交渉中'
  | '販売承認中'
  | '成約'
  | '見送り'
  | '停止';

// ===== 物件台帳 (台帳一行 = A~AB 28列) =====
export interface PropertyListing {
  rowNum: number;
  acceptedAt: Date | null;          // A: 受付日
  caseId: string;                   // B: 案件ID (MAC-YYYYMMDD-XXXX)
  propertyName: string;             // C: 物件名
  propertyType: PropertyType;           // D: 種別
  area: string;                     // E: エリア
  address: string;                  // F: 所在地
  priceMlanEn: number | null;       // G: 金額_万円
  marketTsuboPrice: number | null;  // H: 市場坪単価_万円
  marketVerdict: string;            // I: 市場比較
  taxCategory: string;              // J: 金額_消費税
  priceCondition: string;           // K: 金額_条件
  landAreaM2: number | null;        // L: 土地面積_m2
  buildingAreaM2: number | null;    // M: 建物面積_m2
  nearestStation: string;           // N: 最寄り駅
  walkMinutes: number | null;       // O: 徒歩_分
  zoningUse: string;                // P: 用途地域_区分
  coverageRatio: number | null;     // Q: 建蔽率_%
  floorAreaRatio: number | null;    // R: 容積率_%
  tsuboPrice: number | null;        // S: 坪単価_万円
  tsuboPriceType: string;           // T: 坪単価_種別
  currentRentYen: number | null;    // U: 現況賃料_月
  grossYield: number | null;        // V: 表面利回り_%
  notes: string;                    // W: 備考
  driveFolderUrl: string;           // X: DriveフォルダURL
  caseStatus: CaseStatus;           // Y: 案件ステータス
  infoSource: string;               // Z: 情報源
  overviewPdfUrl: string;           // AA: 概要書PDF_URL
  fileUrl: string;                  // AB: 元ファイルURL
}

// ===== OCR抽出データ =====
export interface OcrExtractedData {
  propertyName: string;
  propertyType: string;
  address: string;
  area: string;
  priceMlanEn: number | null;
  taxCategory: string;
  priceCondition: string;
  landAreaM2: number | null;
  buildingAreaM2: number | null;
  nearestStation: string;
  walkMinutes: number | null;
  zoningUse: string;
  coverageRatio: number | null;
  floorAreaRatio: number | null;
  currentRentYen: number | null;
  notes: string;
  rawText: string;
  confidence: number; // 0-1
}

// ===== 処理ログ =====
export interface ProcessLog {
  timestamp: Date;   // A: 日付
  level: string;     // B: レベル (INFO / ERROR / WARN)
  message: string;   // C: メッセージ
  fileName: string;  // D: ファイル名
}

// ===== PDF処理結果 =====
export interface PdfProcessResult {
  fileName: string;
  fileId: string;
  isOverview: boolean;
  ocrData: OcrExtractedData | null;
  caseId: string | null;
  error?: string;
}

// ===== ジオコーディング結果 =====
export interface GeocodingResult {
  lat: number;
  lng: number;
  source: 'gsi' | 'google_maps';
  matchLevel: string;
}

// ===== 最寄り駅情報 =====
export interface StationInfo {
  name: string;
  line: string;
  walkMinutes: number;
  distance: number;
}

// ===== 用途地域情報 =====
export interface ZoningInfo {
  use: string;
  coverageRatio: number | null;
  floorAreaRatio: number | null;
  source: 'nlftp' | 'gemini';
}

// ===== システム状態 =====
export interface SystemStatus {
  totalListings: number;
  newListings: number;
  enrichedCount: number;
  pendingEnrichment: number;
  lastProcessedAt: Date | null;
  apiKeyStatus: {
    gemini: boolean;
    googleMaps: boolean;
    mlit: boolean;
  };
}
