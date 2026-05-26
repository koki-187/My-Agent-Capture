import { extractFromFile } from '../services/gemini.service';
import { appendListing, updateCells, writeLog, getAllListings, getListingByCaseId } from '../services/sheets.service';
import { uploadPropertyDocument, uploadFile, getPropertyFolder } from '../services/drive.service';
import { generateOverviewPdf, getOverviewFileName } from '../services/generator.service';
import { researchMissingData } from '../services/research.service';
import { replyText, getMessageContent, buildProcessingResult, buildErrorMessage, pushMessage } from '../services/line.service';
import { OcrExtractedData, PropertyListing } from '../types/property';
import { PROPERTY_TYPE_MAP, COL } from '../config';
import logger from '../utils/logger';

export interface MessageEvent {
  replyToken: string;
  userId: string;
  messageId: string;
  messageType: 'image' | 'file' | 'text';
  mimeType?: string;
  fileName?: string;
  text?: string;
}

export async function handlePropertyDocument(event: MessageEvent): Promise<void> {
  const { replyToken, userId, messageId, messageType, fileName = 'document' } = event;

  logger.info(`物件資料受信: ${messageType} (user: ${userId})`);

  // 処理中通知
  await replyText(replyToken, '📥 資料を受け取りました。処理中です...\n(30秒〜2分ほどかかります)');

  try {
    // 1. ファイル取得
    const buffer = await getMessageContent(messageId);
    const mimeType = event.mimeType || (messageType === 'image' ? 'image/jpeg' : 'application/pdf');

    // 2. OCR
    logger.info(`OCR開始: ${fileName}`);
    const ocrData = await extractFromFile(buffer, mimeType, fileName);
    logger.info(`OCR完了: 信頼度=${ocrData.confidence}, 種別=${ocrData.propertyType}`);

    // 3. 不足データ補完
    const enriched = await researchMissingData(ocrData);
    const enrichedFiltered = Object.fromEntries(
      Object.entries(enriched).filter(([, v]) => v !== null && v !== undefined && v !== '')
    );
    const mergedOcr: OcrExtractedData = { ...ocrData, ...enrichedFiltered };

    // 4. 案件ID生成 + 台帳登録（初回）
    const { rowNum, caseId } = await appendListing({
      propertyName: mergedOcr.propertyName,
      propertyType: PROPERTY_TYPE_MAP[mergedOcr.propertyType] || mergedOcr.propertyType || 'その他',
      area: mergedOcr.area,
      address: mergedOcr.address,
      caseStatus: '新規',
      infoSource: 'LINE',
    }, mergedOcr);

    // 5. Driveへファイルアップロード
    const propertyType = PROPERTY_TYPE_MAP[mergedOcr.propertyType] || mergedOcr.propertyType || 'その他';
    const { folderId, folderUrl, fileUrl } = await uploadPropertyDocument(
      buffer,
      fileName,
      mimeType,
      propertyType,
      caseId
    );

    // 6. 物件概要書PDF生成
    let overviewUrl: string | undefined;
    try {
      const listingData: Partial<PropertyListing> = {
        caseId,
        propertyName: mergedOcr.propertyName,
        propertyType,
        address: mergedOcr.address,
        area: mergedOcr.area,
        priceMlanEn: mergedOcr.priceMlanEn,
        landAreaM2: mergedOcr.landAreaM2,
        buildingAreaM2: mergedOcr.buildingAreaM2,
        nearestStation: mergedOcr.nearestStation,
        walkMinutes: mergedOcr.walkMinutes,
        zoningUse: mergedOcr.zoningUse,
        coverageRatio: mergedOcr.coverageRatio,
        floorAreaRatio: mergedOcr.floorAreaRatio,
        notes: mergedOcr.notes,
      };

      const pdfBuffer = await generateOverviewPdf(listingData);
      const pdfFileName = getOverviewFileName(caseId);
      const pdfUpload = await uploadFile(pdfBuffer, pdfFileName, 'application/pdf', folderId);
      overviewUrl = pdfUpload.url;
    } catch (pdfErr: any) {
      logger.warn(`概要書生成スキップ: ${pdfErr.message}`);
    }

    // 7. 台帳の URL 列を更新
    const updates = [
      { rowNum, colNum: COL.FOLDER_URL, value: folderUrl },
      { rowNum, colNum: COL.FILE_URL, value: fileUrl },
    ];
    if (overviewUrl) {
      updates.push({ rowNum, colNum: COL.OVERVIEW_URL, value: overviewUrl });
    }
    await updateCells(updates);

    // 8. ログ書き込み
    await writeLog({
      timestamp: new Date(),
      level: 'INFO',
      message: `物件登録完了: ${caseId} (${propertyType})`,
      fileName,
    });

    // 9. 結果をpush通知 (replyTokenは処理中通知で使用済みのためpushMessageを使用)
    logger.info(`処理完了: ${caseId}`);
    const resultMessages = buildProcessingResult(caseId, mergedOcr.propertyName || '', folderUrl, overviewUrl);
    await pushMessage(userId, resultMessages);

  } catch (error: any) {
    logger.error(`物件資料処理エラー: ${error.message}`, { error });
    await pushMessage(userId, [buildErrorMessage('general')]).catch(() => {});
    await writeLog({
      timestamp: new Date(),
      level: 'ERROR',
      message: `処理エラー: ${error.message}`,
      fileName,
    }).catch(() => {});
  }
}

export async function handleTextMessage(event: MessageEvent): Promise<void> {
  const text = (event.text || '').trim();
  const { replyToken } = event;

  if (text.includes('ヘルプ') || text.includes('help') || text.toLowerCase().includes('help') || text.includes('使い方')) {
    const helpText = [
      '📋 MAC - My Agent Capture 使い方',
      '',
      '▶ 物件資料を送信するだけで自動登録',
      '対応フォーマット: PDF・画像(JPEG/PNG)',
      '',
      '自動で行われる処理:',
      '① OCRで物件情報を読み取り',
      '② Google スプレッドシートに登録',
      '③ Google Driveに資料を保存',
      '④ 物件概要書PDFを自動生成',
      '',
      '【コマンド一覧】',
      '「案件一覧」→ 最新10件を表示',
      '「案件 MAC-XXXXXXXX-XXXX」→ 個別案件を検索',
    ].join('\n');
    await replyText(replyToken, helpText);
    return;
  }

  if (text.includes('案件一覧') || text === '一覧') {
    await handleCaseList(event);
    return;
  }

  // 案件ID検索: "案件 MAC-20260527-0001" や "MAC-20260527-0001"
  const caseIdMatch = text.match(/MAC-\d{8}-\d{4}/);
  if (caseIdMatch) {
    await handleCaseSearch(event, caseIdMatch[0]);
    return;
  }

  await replyText(replyToken, '物件資料（PDF/画像）を送信してください。\n「ヘルプ」と送信すると使い方を確認できます。');
}

async function handleCaseList(event: MessageEvent): Promise<void> {
  const { replyToken } = event;
  try {
    const listings = await getAllListings();
    const recent = listings
      .filter(l => l.caseId)
      .slice(-10)
      .reverse();

    if (recent.length === 0) {
      await replyText(replyToken, '登録済みの案件はありません。\n物件資料を送信して最初の案件を登録しましょう。');
      return;
    }

    const lines = ['📋 最新案件一覧\n'];
    recent.forEach((l, i) => {
      const price = l.priceMlanEn ? `${l.priceMlanEn.toLocaleString()}万円` : '価格未定';
      const status = l.caseStatus || '新規';
      lines.push(`${i + 1}. ${l.caseId}`);
      lines.push(`   ${l.propertyName || '(物件名未設定)'} [${l.propertyType || '種別不明'}]`);
      lines.push(`   ${price} | ${status}`);
      if (l.address) lines.push(`   📍 ${l.address}`);
      lines.push('');
    });
    lines.push(`合計 ${listings.length} 件登録済み`);

    await replyText(replyToken, lines.join('\n'));
  } catch (e: any) {
    logger.error(`案件一覧取得エラー: ${e.message}`);
    await replyText(replyToken, '案件一覧の取得に失敗しました。');
  }
}

async function handleCaseSearch(event: MessageEvent, caseId: string): Promise<void> {
  const { replyToken } = event;
  try {
    const listing = await getListingByCaseId(caseId);
    if (!listing) {
      await replyText(replyToken, `案件 ${caseId} は見つかりませんでした。`);
      return;
    }

    const lines = [
      `🏠 ${listing.propertyName || '(物件名未設定)'}`,
      `案件ID: ${listing.caseId}`,
      `種別: ${listing.propertyType || '—'}`,
      `所在地: ${listing.address || '—'}`,
      `金額: ${listing.priceMlanEn ? listing.priceMlanEn.toLocaleString() + '万円' : '—'}`,
      `土地: ${listing.landAreaM2 ? listing.landAreaM2 + '㎡' : '—'}`,
      `建物: ${listing.buildingAreaM2 ? listing.buildingAreaM2 + '㎡' : '—'}`,
      `最寄: ${listing.nearestStation || '—'}${listing.walkMinutes ? ' 徒歩' + listing.walkMinutes + '分' : ''}`,
      `ステータス: ${listing.caseStatus || '新規'}`,
    ];

    if (listing.driveFolderUrl) {
      lines.push(`📁 Drive: ${listing.driveFolderUrl}`);
    }
    if (listing.overviewPdfUrl) {
      lines.push(`📄 概要書: ${listing.overviewPdfUrl}`);
    }

    await replyText(replyToken, lines.join('\n'));
  } catch (e: any) {
    logger.error(`案件検索エラー: ${e.message}`);
    await replyText(replyToken, '案件の検索に失敗しました。');
  }
}
