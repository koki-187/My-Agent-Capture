import { GoogleGenerativeAI } from '@google/generative-ai';
import { ENV, API_CONFIG, PROPERTY_TYPE_MAP } from '../config';
import { OcrExtractedData } from '../types/property';
import logger from '../utils/logger';

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    if (!ENV.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEYが未設定です');
    }
    genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);
  }
  return genAI;
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`タイムアウト (${label}: ${timeoutMs}ms)`)), timeoutMs);
    fn().then(r => { clearTimeout(timer); resolve(r); }).catch(e => { clearTimeout(timer); reject(e); });
  });
}

async function withRetry<T>(fn: () => Promise<T>, opts: { maxRetries: number; label: string }): Promise<T> {
  let lastErr: Error | null = null;
  for (let i = 0; i <= opts.maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (i < opts.maxRetries) {
        const delay = API_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, i);
        logger.warn(`リトライ ${i + 1}/${opts.maxRetries} (${opts.label}): ${e.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr ?? new Error('リトライ失敗');
}

export async function extractFromFile(buffer: Buffer, mimeType: string, fileName: string): Promise<OcrExtractedData> {
  logger.info(`OCR開始: ${fileName} (${mimeType})`);

  if (!buffer || buffer.length === 0) {
    logger.error(`空のバッファ: ${fileName}`);
    return createEmptyOcrData(fileName, 'バッファが空です');
  }

  if (buffer.length > 50 * 1024 * 1024) {
    logger.error(`ファイルサイズ超過 (${Math.round(buffer.length / 1024 / 1024)}MB): ${fileName}`);
    return createEmptyOcrData(fileName, 'ファイルサイズが50MBを超過');
  }

  const sizeKB = buffer.length / 1024;
  const ocrTimeout = sizeKB > 3000 ? 180000 : sizeKB > 1000 ? 120000 : 60000;
  const parseTimeout = sizeKB > 3000 ? 90000 : 60000;

  // Determine MIME type for Gemini
  const geminiMimeType = getGeminiMimeType(mimeType);

  try {
    const rawText = await withRetry(
      () => withTimeout(() => extractRawText(buffer, geminiMimeType), ocrTimeout, 'OCRテキスト抽出'),
      { maxRetries: 2, label: 'OCRテキスト抽出' }
    );

    const structured = await withRetry(
      () => withTimeout(() => parseStructuredData(rawText, fileName), parseTimeout, 'OCR構造化解析'),
      { maxRetries: 1, label: 'OCR構造化解析' }
    );

    const validated = validateOcrData(structured);
    logger.info(`OCR完了: ${fileName} → ${validated.propertyName || '(物件名なし)'}`);
    return validated;
  } catch (error: any) {
    logger.error(`OCRエラー (${fileName}): ${error.message}`);

    // Fallback: Vision-style direct JSON extraction
    try {
      logger.info(`Gemini Visionフォールバック: ${fileName}`);
      const visionResult = await withRetry(
        () => withTimeout(() => extractWithVision(buffer, geminiMimeType, fileName), ocrTimeout, 'Vision OCR'),
        { maxRetries: 1, label: 'Vision OCR' }
      );
      return validateOcrData(visionResult);
    } catch (fallbackError: any) {
      logger.error(`フォールバック失敗: ${fallbackError.message}`);
      return createEmptyOcrData(fileName, error.message);
    }
  }
}

function getGeminiMimeType(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'application/pdf';
  if (mimeType.startsWith('image/')) return mimeType;
  return 'application/pdf';
}

async function extractRawText(buffer: Buffer, mimeType: string): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: API_CONFIG.GEMINI_MODEL });

  const base64 = buffer.toString('base64');

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64,
      },
    },
    {
      text: `この不動産物件情報のPDF/画像からすべてのテキスト情報を正確に読み取って、そのままの形で出力してください。
読み取ったテキストをそのまま最大限忠実に出力してください。`,
    },
  ]);

  const text = result.response.text();
  if (!text || text.trim().length === 0) {
    throw new Error('OCRテキスト抽出結果が空');
  }
  return text;
}

async function parseStructuredData(rawText: string, fileName: string): Promise<OcrExtractedData> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({
    model: API_CONFIG.GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const prompt = `以下の不動産物件情報のテキストから情報を抽出し、JSON形式で出力してください。

【テキスト】
${rawText}

【出力JSON形式】以下の形式で出力してください:
{
  "propertyName": "物件名（建物名がなければ所在地から生成）",
  "propertyType": "種別（戸建て/古家あり/マンション/低層マンション/一棟レジデンス/一棟ビル/空き地/ロードサイド付き使用地 のいずれか）",
  "address": "所在地（都道府県市区町村から詳細住所まで）",
  "area": "エリア（都道府県市区町村名）",
  "priceMlanEn": 金額（万円の数値、消費税の場合は万円に換算。例: 1.5億 → 15000）,
  "taxCategory": "消費税/非課税/なし",
  "priceCondition": "価格条件（要相談/値下げ可/現状有姿/なければ空欄）",
  "landAreaM2": 土地面積（m2の数値、坪の場合は×3.3058で換算）,
  "buildingAreaM2": 建物面積（m2の数値）,
  "nearestStation": "最寄り駅名",
  "walkMinutes": 徒歩分数（数値のみ）,
  "zoningUse": "用途地域区分",
  "coverageRatio": 建蔽率（%の数値）,
  "floorAreaRatio": 容積率（%の数値）,
  "currentRentYen": 現況賃料（万円/月の数値。なければnull）,
  "notes": "備考・特記事項",
  "confidence": 抽出の信頼度（0～1の数値）
}

値が不明な場合は null を返してください。
金額が「なし」「相談」の場合は null を返してください。`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  try {
    const parsed = JSON.parse(responseText);
    return {
      propertyName: parsed.propertyName || '',
      propertyType: normalizePropertyType(parsed.propertyType || ''),
      address: parsed.address || '',
      area: parsed.area || '',
      priceMlanEn: parsed.priceMlanEn ?? null,
      taxCategory: parsed.taxCategory || '',
      priceCondition: parsed.priceCondition || '',
      landAreaM2: parsed.landAreaM2 ?? null,
      buildingAreaM2: parsed.buildingAreaM2 ?? null,
      nearestStation: parsed.nearestStation || '',
      walkMinutes: parsed.walkMinutes ?? null,
      zoningUse: parsed.zoningUse || '',
      coverageRatio: parsed.coverageRatio ?? null,
      floorAreaRatio: parsed.floorAreaRatio ?? null,
      currentRentYen: parsed.currentRentYen ?? null,
      notes: parsed.notes || '',
      rawText,
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    logger.warn(`JSON解析失敗、正規表現フォールバック: ${fileName}`);
    return extractWithRegex(rawText, fileName);
  }
}

async function extractWithVision(buffer: Buffer, mimeType: string, fileName: string): Promise<OcrExtractedData> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({
    model: API_CONFIG.GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const base64 = buffer.toString('base64');

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64,
      },
    },
    {
      text: `この不動産物件情報のPDFから以下のJSON形式でデータを抽出してください:
{"propertyName": "", "propertyType": "", "address": "", "area": "",
"priceMlanEn": null, "taxCategory": "", "priceCondition": "",
"landAreaM2": null, "buildingAreaM2": null, "nearestStation": "",
"walkMinutes": null, "zoningUse": "", "coverageRatio": null,
"floorAreaRatio": null, "currentRentYen": null, "notes": "", "confidence": 0.5}`,
    },
  ]);

  const text = result.response.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    logger.warn(`Vision OCR: JSONパース失敗 (${fileName})`);
    return createEmptyOcrData(fileName, 'Vision OCR JSONパース失敗');
  }

  return {
    propertyName: parsed.propertyName || '',
    propertyType: normalizePropertyType(parsed.propertyType || ''),
    address: parsed.address || '',
    area: parsed.area || '',
    priceMlanEn: typeof parsed.priceMlanEn === 'number' ? parsed.priceMlanEn : null,
    taxCategory: parsed.taxCategory || '',
    priceCondition: parsed.priceCondition || '',
    landAreaM2: typeof parsed.landAreaM2 === 'number' ? parsed.landAreaM2 : null,
    buildingAreaM2: typeof parsed.buildingAreaM2 === 'number' ? parsed.buildingAreaM2 : null,
    nearestStation: parsed.nearestStation || '',
    walkMinutes: typeof parsed.walkMinutes === 'number' ? parsed.walkMinutes : null,
    zoningUse: parsed.zoningUse || '',
    coverageRatio: typeof parsed.coverageRatio === 'number' ? parsed.coverageRatio : null,
    floorAreaRatio: typeof parsed.floorAreaRatio === 'number' ? parsed.floorAreaRatio : null,
    currentRentYen: typeof parsed.currentRentYen === 'number' ? parsed.currentRentYen : null,
    notes: parsed.notes || '',
    rawText: '(Vision fallback)',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.3,
  };
}

function extractWithRegex(rawText: string, _fileName: string): OcrExtractedData {
  const addressMatch = rawText.match(/(?:所在地|住所)[：:]\s*(.+?)(?:\n|$)/);
  const priceMatch = rawText.match(/(?:価格|売価|金額)[：:]\s*([\d,.]+)\s*(?:万円|億)/);
  const landMatch = rawText.match(/(?:土地面積|敷地面積)[：:]\s*([\d,.]+)\s*(?:m[²2]|㎡)/);
  const bldgMatch = rawText.match(/(?:建物面積|延床面積)[：:]\s*([\d,.]+)\s*(?:m[²2]|㎡)/);
  const stationMatch = rawText.match(/(?:最寄り|交通)[：:]\s*(.+?)(?:駅|停)/);

  return {
    propertyName: '',
    propertyType: '',
    address: addressMatch?.[1]?.trim() || '',
    area: '',
    priceMlanEn: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null,
    taxCategory: '',
    priceCondition: '',
    landAreaM2: landMatch ? parseFloat(landMatch[1].replace(/,/g, '')) : null,
    buildingAreaM2: bldgMatch ? parseFloat(bldgMatch[1].replace(/,/g, '')) : null,
    nearestStation: stationMatch?.[1]?.trim() || '',
    walkMinutes: null,
    zoningUse: '',
    coverageRatio: null,
    floorAreaRatio: null,
    currentRentYen: null,
    notes: 'OCR抽出方式: 正規表現フォールバック',
    rawText,
    confidence: 0.3,
  };
}

function normalizePropertyType(raw: string): string {
  const trimmed = raw.trim();
  return PROPERTY_TYPE_MAP[trimmed] || trimmed;
}

function validateOcrData(data: OcrExtractedData): OcrExtractedData {
  const sanitized = { ...data };
  if (sanitized.priceMlanEn !== null && sanitized.priceMlanEn < 0) sanitized.priceMlanEn = null;
  if (sanitized.landAreaM2 !== null && sanitized.landAreaM2 < 0) sanitized.landAreaM2 = null;
  if (sanitized.buildingAreaM2 !== null && sanitized.buildingAreaM2 < 0) sanitized.buildingAreaM2 = null;
  if (sanitized.walkMinutes !== null && (sanitized.walkMinutes < 0 || sanitized.walkMinutes > 120)) sanitized.walkMinutes = null;
  if (sanitized.confidence < 0) sanitized.confidence = 0;
  if (sanitized.confidence > 1) sanitized.confidence = 1;
  return sanitized;
}

function createEmptyOcrData(fileName: string, errorMsg: string): OcrExtractedData {
  return {
    propertyName: '',
    propertyType: '',
    address: '',
    area: '',
    priceMlanEn: null,
    taxCategory: '',
    priceCondition: '',
    landAreaM2: null,
    buildingAreaM2: null,
    nearestStation: '',
    walkMinutes: null,
    zoningUse: '',
    coverageRatio: null,
    floorAreaRatio: null,
    currentRentYen: null,
    notes: `OCR失敗: ${errorMsg}`,
    rawText: '',
    confidence: 0,
  };
}
