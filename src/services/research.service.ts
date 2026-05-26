import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { API_CONFIG, M2_TO_TSUBO } from '../config';
import { OcrExtractedData, StationInfo } from '../types/property';
import logger from '../utils/logger';

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  return _genAI;
}

// ===== ジオコーディング (国土地理院) =====
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await axios.get(API_CONFIG.GSI_GEOCODER_URL, {
      params: { q: address },
      timeout: 10000,
    });
    const items = res.data;
    if (!items || items.length === 0) return null;
    const item = items[0];
    return {
      lat: parseFloat(item.geometry.coordinates[1]),
      lng: parseFloat(item.geometry.coordinates[0]),
    };
  } catch (e: any) {
    logger.warn(`ジオコーディング失敗 (${address}): ${e.message}`);
    return null;
  }
}

// ===== 最寄り駅検索 (HeartRails) =====
export async function findNearestStation(lat: number, lng: number): Promise<StationInfo | null> {
  try {
    const res = await axios.get(API_CONFIG.HEARTTRAILS_URL, {
      params: { method: 'searchByGeo', x: lng, y: lat, radius: 1.5, limit: 1 },
      timeout: 10000,
    });
    const stations = res.data.response?.station;
    if (!stations || stations.length === 0) return null;
    const s = stations[0];
    return {
      name: s.name,
      line: s.line,
      walkMinutes: Math.ceil(parseFloat(s.distance) * 1000 / 80),
      distance: parseFloat(s.distance) * 1000,
    };
  } catch (e: any) {
    logger.warn(`最寄り駅検索失敗: ${e.message}`);
    return null;
  }
}

// ===== 用途地域検索 (不動産情報ライブラリ Reinfolib) =====
export async function findZoningInfo(lat: number, lng: number): Promise<string> {
  const apiKey = process.env.MLIT_API_KEY;
  if (!apiKey) return '';

  try {
    const url = `https://www.reinfolib.mlit.go.jp/ex-api/external/XKT005?lat=${lat}&lon=${lng}`;
    const res = await axios.get(url, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      timeout: 8000,
    });

    const features = res.data?.features;
    if (!Array.isArray(features) || features.length === 0) return '';

    const zone = features[0]?.properties?.youto;
    if (!zone) return '';

    return String(zone);
  } catch (e: any) {
    logger.warn(`用途地域取得失敗: ${e.message}`);
    return '';
  }
}

// ===== Geminiを使って不足データを補完 =====
export async function enrichWithGemini(ocrData: OcrExtractedData, address: string): Promise<Partial<OcrExtractedData>> {
  if (!address) return {};

  try {
    const model = getGenAI().getGenerativeModel({
      model: API_CONFIG.GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `以下の不動産物件の住所から、利用可能な情報を推定してJSON形式で返してください。
住所: ${address}

{"area": "エリア（都道府県市区町村）", "zoningUse": "推定用途地域（例: 第一種低層住居専用地域）", "notes": "補記事項"}

確実でない情報は空文字列にしてください。`;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    return {
      area: parsed.area || ocrData.area,
      zoningUse: parsed.zoningUse || ocrData.zoningUse,
    };
  } catch (e: any) {
    logger.warn(`Gemini補完失敗: ${e.message}`);
    return {};
  }
}

// ===== 坪単価計算 =====
export function calcTsuboPrice(priceMlanEn: number | null, areaM2: number | null, areaType: 'land' | 'building'): number | null {
  if (priceMlanEn == null || areaM2 == null || areaM2 === 0) return null;
  const tsubo = areaM2 / M2_TO_TSUBO;
  return Math.round((priceMlanEn / tsubo) * 10) / 10;
}

// ===== メインのリサーチ処理 =====
export async function researchMissingData(ocrData: OcrExtractedData): Promise<Partial<OcrExtractedData>> {
  const enriched: Partial<OcrExtractedData> = {};

  // Step 1: エリア情報補完
  if (!ocrData.area && ocrData.address) {
    const geminiResult = await enrichWithGemini(ocrData, ocrData.address);
    Object.assign(enriched, geminiResult);
  }

  // Step 2: ジオコーディング → 最寄り駅・用途地域
  if (ocrData.address && (!ocrData.nearestStation || !ocrData.zoningUse)) {
    await new Promise(r => setTimeout(r, API_CONFIG.GEOCODE_WAIT_MS));
    const geocode = await geocodeAddress(ocrData.address);

    if (geocode) {
      if (!ocrData.nearestStation) {
        const station = await findNearestStation(geocode.lat, geocode.lng);
        if (station) {
          enriched.nearestStation = station.name;
          if (!ocrData.walkMinutes) enriched.walkMinutes = station.walkMinutes;
        }
      }

      if (!ocrData.zoningUse) {
        const zoningUse = await findZoningInfo(geocode.lat, geocode.lng);
        if (zoningUse) enriched.zoningUse = zoningUse;
      }
    }
  }

  return enriched;
}
