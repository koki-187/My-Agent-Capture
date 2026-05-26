import { extractFromFile } from '../services/gemini.service';
import { appendListing, updateCells, writeLog } from '../services/sheets.service';
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
  const text = event.text || '';
  const { replyToken } = event;

  if (text.includes('ヘルプ') || text.includes('help') || text.includes('使い方')) {
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
    ].join('\n');
    await replyText(replyToken, helpText);
  } else {
    await replyText(replyToken, '物件資料（PDF/画像）を送信してください。\n「ヘルプ」と送信すると使い方を確認できます。');
  }
}
