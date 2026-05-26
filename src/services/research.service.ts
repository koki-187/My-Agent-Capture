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

// ===== 取引事例調査 (MLIT Reinfolib XKT001) =====
export async function fetchTransactionHistory(
  lat: number,
  lng: number,
  propertyType: string
): Promise<{ avgTsuboPrice: number | null; sampleCount: number; summary: string }> {
  const apiKey = process.env.MLIT_API_KEY;
  if (!apiKey) return { avgTsuboPrice: null, sampleCount: 0, summary: '' };

  try {
    const now = new Date();
    const fromYear = now.getFullYear() - 2;
    const url = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XKT001';
    const res = await axios.get(url, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      params: { lat, lon: lng, radius: 1 },
      timeout: 10000,
    });

    const features: any[] = res.data?.features || [];
    if (features.length === 0) return { avgTsuboPrice: null, sampleCount: 0, summary: '' };

    // Filter by year (last 2 years) and similar type
    const typeKeywords = getTypeKeywords(propertyType);
    const relevant = features.filter((f: any) => {
      const p = f.properties || {};
      const tradeYear = parseInt(String(p.TradeYear || p.年), 10);
      if (tradeYear && tradeYear < fromYear) return false;
      const tradeType = String(p.Type || p.種類 || '');
      return typeKeywords.some(k => tradeType.includes(k));
    });

    const sample = relevant.length > 0 ? relevant : features.slice(0, 10);

    const tsuboPrices = sample
      .map((f: any) => {
        const p = f.properties || {};
        const price = parseFloat(String(p.TradePrice || p.取引価格 || '0').replace(/[^0-9.]/g, ''));
        const area = parseFloat(String(p.Area || p.面積 || '0').replace(/[^0-9.]/g, ''));
        if (!price || !area) return null;
        const tsubo = area / M2_TO_TSUBO;
        return tsubo > 0 ? Math.round((price / 10000) / tsubo) : null;
      })
      .filter((v): v is number => v !== null && v > 0 && v < 100000);

    if (tsuboPrices.length === 0) return { avgTsuboPrice: null, sampleCount: 0, summary: '' };

    const avg = Math.round(tsuboPrices.reduce((a, b) => a + b, 0) / tsuboPrices.length);
    const min = Math.min(...tsuboPrices);
    const max = Math.max(...tsuboPrices);
    const summary = `過去2年 ${tsuboPrices.length}件 | 坪単価 ${min}〜${max}万円 (平均${avg}万円)`;

    logger.info(`取引事例取得: ${tsuboPrices.length}件, 平均坪単価=${avg}万円`);
    return { avgTsuboPrice: avg, sampleCount: tsuboPrices.length, summary };
  } catch (e: any) {
    logger.warn(`取引事例取得失敗: ${e.message}`);
    return { avgTsuboPrice: null, sampleCount: 0, summary: '' };
  }
}

function getTypeKeywords(propertyType: string): string[] {
  const map: Record<string, string[]> = {
    '戸建て': ['宅地(土地と建物)', '戸建'],
    '古家あり': ['宅地(土地と建物)', '戸建'],
    '低層マンション': ['中古マンション', 'マンション'],
    '一棟レジデンス': ['宅地(土地と建物)', 'マンション'],
    '一棟ビル': ['宅地(土地)', '商業用'],
    '空き地': ['宅地(土地)', '農地'],
    'ロードサイド付き使用地': ['宅地(土地)', '商業用'],
    '中古マンション': ['中古マンション', 'マンション'],
  };
  return map[propertyType] || ['宅地(土地と建物)'];
}

// ===== 周辺相場賃料推定 (Gemini) =====
export async function estimateMarketRent(
  address: string,
  propertyType: string,
  landAreaM2: number | null,
  buildingAreaM2: number | null,
  nearestStation: string,
  walkMinutes: number | null
): Promise<{ rentPerMonth: number | null; notes: string }> {
  try {
    const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' });
    const areaInfo = buildingAreaM2
      ? `建物面積${buildingAreaM2}㎡`
      : landAreaM2
      ? `土地面積${landAreaM2}㎡`
      : '';
    const stationInfo = nearestStation
      ? `${nearestStation}${walkMinutes ? `徒歩${walkMinutes}分` : ''}`
      : '';

    const prompt = `以下の不動産物件の周辺相場賃料を推定してください。
所在地: ${address}
種別: ${propertyType}
${areaInfo}
${stationInfo}

日本の不動産市場データに基づき、現実的な月額賃料の推定値を万円単位で回答してください。
JSON形式で返答: {"rentPerMonth": 数値(万円), "reasoning": "根拠の説明(100字以内)"}
不明な場合はnullを返してください。`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    });

    const raw = result.response.text();
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const rent = typeof parsed.rentPerMonth === 'number' && parsed.rentPerMonth > 0
      ? parsed.rentPerMonth
      : null;

    logger.info(`相場賃料推定: ${rent ? rent + '万円/月' : '取得不可'}`);
    return { rentPerMonth: rent, notes: parsed.reasoning || '' };
  } catch (e: any) {
    logger.warn(`相場賃料推定失敗: ${e.message}`);
    return { rentPerMonth: null, notes: '' };
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
  let lat: number | null = null;
  let lng: number | null = null;

  if (ocrData.address && (!ocrData.nearestStation || !ocrData.zoningUse)) {
    await new Promise(r => setTimeout(r, API_CONFIG.GEOCODE_WAIT_MS));
    const geocode = await geocodeAddress(ocrData.address);

    if (geocode) {
      lat = geocode.lat;
      lng = geocode.lng;

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

  // Step 3: 取引事例・相場調査 (座標が取得できた場合のみ)
  if (lat !== null && lng !== null) {
    const transactionData = await fetchTransactionHistory(lat, lng, ocrData.propertyType || '');

    if (transactionData.summary) {
      const transactionNote = `【取引事例】${transactionData.summary}`;
      enriched.notes = ocrData.notes
        ? `${ocrData.notes}\n${transactionNote}`
        : transactionNote;
    }

    // 現況賃料が空の場合のみ相場賃料を推定
    if (!ocrData.currentRentYen && ocrData.propertyType !== '空き地') {
      const rentData = await estimateMarketRent(
        ocrData.address || '',
        ocrData.propertyType || '',
        ocrData.landAreaM2,
        ocrData.buildingAreaM2,
        enriched.nearestStation || ocrData.nearestStation || '',
        enriched.walkMinutes ?? ocrData.walkMinutes ?? null
      );

      if (rentData.notes) {
        const rentNote = `【相場賃料推定】${rentData.notes}`;
        const baseNotes = enriched.notes ?? ocrData.notes;
        enriched.notes = baseNotes ? `${baseNotes}\n${rentNote}` : rentNote;
      }
    }
  }

  return enriched;
}
