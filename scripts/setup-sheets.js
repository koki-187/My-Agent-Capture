#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env'), override: true });

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const LEDGER_HEADERS = [
  '受付日','案件ID','物件名','種別','エリア','所在地',
  '金額_万円','市場坪単価_万円','市場比較',
  '金額_消費税','金額_条件','土地面積_m2','建物面積_m2',
  '最寄り駅','徒歩_分','用途地域_区分','建蔽率_%','容積率_%',
  '坪単価_万円','坪単価_種別','現況賃料_月','表面利回り_%',
  '備考','DriveフォルダURL','案件ステータス','情報源',
  '概要書PDF_URL','元ファイルURL',
];

const TYPE_SHEET_HEADERS = ['受付日','案件ID','物件名','所在地','金額','土地面積','最寄り駅','徒歩','概要書PDF','ステータス'];

const PROPERTY_TYPES = ['戸建て','古家あり','低層マンション','一棟レジデンス','一棟ビル','空き地','ロードサイド付き使用地','中古マンション'];

const LOG_HEADERS = ['日付','レベル','メッセージ','ファイル名'];

function getAuth() {
  const keyPath = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: { client_email: key.client_email, private_key: key.private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function columnToLetter(col) {
  let letter = '';
  let c = col;
  while (c > 0) {
    const mod = (c - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    c = Math.floor((c - 1) / 26);
  }
  return letter;
}

async function ensureSheet(sheets, spreadsheetId, sheetName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(s => s.properties?.title === sheetName);
  if (existing) {
    console.log(`  ✓ シート存在確認: ${sheetName}`);
    return existing.properties.sheetId;
  }

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });
  const newId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
  console.log(`  ✓ シート作成: ${sheetName} (ID: ${newId})`);
  return newId;
}

async function writeHeaderIfEmpty(sheets, spreadsheetId, sheetName, headers) {
  const range = `${sheetName}!A1:${columnToLetter(headers.length)}1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const existing = res.data.values?.[0] || [];
  if (existing.length > 0 && existing[0] === headers[0]) {
    console.log(`  ✓ ヘッダー確認: ${sheetName} (${headers.length}列)`);
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  });
  console.log(`  ✓ ヘッダー書き込み: ${sheetName} (${headers.length}列)`);
}

async function formatHeaderRow(sheets, spreadsheetId, sheetId, columnCount) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.267, green: 0.447, blue: 0.769 },
                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    },
  });
}

async function setColumnWidths(sheets, spreadsheetId, sheetId) {
  // Column widths for 案件表_台帳 (0-indexed)
  const widths = [
    { col: 0, width: 90 },   // A: 受付日
    { col: 1, width: 160 },  // B: 案件ID
    { col: 2, width: 200 },  // C: 物件名
    { col: 3, width: 120 },  // D: 種別
    { col: 4, width: 100 },  // E: エリア
    { col: 5, width: 220 },  // F: 所在地
    { col: 6, width: 100 },  // G: 金額_万円
    { col: 7, width: 130 },  // H: 市場坪単価_万円
    { col: 8, width: 90 },   // I: 市場比較
    { col: 9, width: 110 },  // J: 金額_消費税
    { col: 10, width: 110 }, // K: 金額_条件
    { col: 11, width: 110 }, // L: 土地面積_m2
    { col: 12, width: 110 }, // M: 建物面積_m2
    { col: 13, width: 160 }, // N: 最寄り駅
    { col: 14, width: 80 },  // O: 徒歩_分
    { col: 15, width: 150 }, // P: 用途地域_区分
    { col: 16, width: 90 },  // Q: 建蔽率_%
    { col: 17, width: 90 },  // R: 容積率_%
    { col: 18, width: 110 }, // S: 坪単価_万円
    { col: 19, width: 100 }, // T: 坪単価_種別
    { col: 20, width: 110 }, // U: 現況賃料_月
    { col: 21, width: 100 }, // V: 表面利回り_%
    { col: 22, width: 200 }, // W: 備考
    { col: 23, width: 240 }, // X: DriveフォルダURL
    { col: 24, width: 100 }, // Y: 案件ステータス
    { col: 25, width: 80 },  // Z: 情報源
    { col: 26, width: 240 }, // AA: 概要書PDF_URL
    { col: 27, width: 240 }, // AB: 元ファイルURL
  ];

  const requests = widths.map(({ col, width }) => ({
    updateDimensionProperties: {
      range: {
        sheetId,
        dimension: 'COLUMNS',
        startIndex: col,
        endIndex: col + 1,
      },
      properties: { pixelSize: width },
      fields: 'pixelSize',
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  console.log('  ✓ 列幅設定完了');
}

async function addDropdownValidation(sheets, spreadsheetId, sheetId) {
  const PROPERTY_TYPES = [
    '戸建て', '古家あり', '低層マンション', '一棟レジデンス',
    '一棟ビル', '空き地', 'ロードサイド付き使用地', '中古マンション',
  ];
  const STATUSES = ['新規', '交渉中', '販売承認中', '成約', '見送り', '停止'];

  const makeDropdown = (values) => ({
    condition: {
      type: 'ONE_OF_LIST',
      values: values.map(v => ({ userEnteredValue: v })),
    },
    showCustomUi: true,
    strict: false,
  });

  const requests = [
    // 種別 (列D = index 3)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 10000, startColumnIndex: 3, endColumnIndex: 4 },
        rule: makeDropdown(PROPERTY_TYPES),
      },
    },
    // 案件ステータス (列Y = index 24)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 10000, startColumnIndex: 24, endColumnIndex: 25 },
        rule: makeDropdown(STATUSES),
      },
    },
    // 情報源 (列Z = index 25)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 10000, startColumnIndex: 25, endColumnIndex: 26 },
        rule: makeDropdown(['紹介', '仲介', '買取', 'LINE', '自社']),
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  console.log('  ✓ ドロップダウン検証設定完了');
}

async function main() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error('✗ GOOGLE_SPREADSHEET_ID が未設定です');
    process.exit(1);
  }

  console.log('Google Spreadsheet を初期化します...');
  console.log(`スプレッドシートID: ${spreadsheetId}\n`);

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  // 台帳シート
  console.log('■ 案件表_台帳 シート:');
  const ledgerSheetId = await ensureSheet(sheets, spreadsheetId, '案件表_台帳');
  await writeHeaderIfEmpty(sheets, spreadsheetId, '案件表_台帳', LEDGER_HEADERS);
  await formatHeaderRow(sheets, spreadsheetId, ledgerSheetId, LEDGER_HEADERS.length);
  await setColumnWidths(sheets, spreadsheetId, ledgerSheetId);
  await addDropdownValidation(sheets, spreadsheetId, ledgerSheetId);

  // 種別シート
  console.log('\n■ 物件種別シート:');
  for (const type of PROPERTY_TYPES) {
    const sheetId = await ensureSheet(sheets, spreadsheetId, type);
    await writeHeaderIfEmpty(sheets, spreadsheetId, type, TYPE_SHEET_HEADERS);
    await formatHeaderRow(sheets, spreadsheetId, sheetId, TYPE_SHEET_HEADERS.length);
  }

  // 処理ログシート
  console.log('\n■ 処理ログ シート:');
  const logSheetId = await ensureSheet(sheets, spreadsheetId, '処理ログ');
  await writeHeaderIfEmpty(sheets, spreadsheetId, '処理ログ', LOG_HEADERS);
  await formatHeaderRow(sheets, spreadsheetId, logSheetId, LOG_HEADERS.length);

  // 設定シート
  console.log('\n■ 設定 シート:');
  await ensureSheet(sheets, spreadsheetId, '設定');
  const settingsData = [
    ['設定項目', '値', '説明'],
    ['エージェント名', process.env.AGENT_NAME || '担当者名', '物件概要書に表示される担当者名'],
    ['会社名', process.env.COMPANY_NAME || '会社名', '物件概要書に表示される会社名'],
    ['セットアップ日時', new Date().toLocaleString('ja-JP'), '初回セットアップ日時'],
    ['バージョン', '1.0.0', 'MACバージョン'],
  ];
  const settingsRange = '設定!A1:C5';
  const existingSettings = await sheets.spreadsheets.values.get({ spreadsheetId, range: settingsRange });
  if (!existingSettings.data.values?.[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: settingsRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: settingsData },
    });
    console.log('  ✓ 設定シート初期化完了');
  } else {
    console.log('  ✓ 設定シート確認済み');
  }

  console.log('\n✓ Spreadsheet の初期化が完了しました');
  console.log(`  URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  console.log('  設定内容: ヘッダー・列幅・ドロップダウン・フォーマット');
}

if (require.main === module) {
  main().catch(e => {
    console.error('✗ エラー:', e.message);
    if (e.message.includes('PERMISSION_DENIED') || e.message.includes('forbidden')) {
      console.error('  → サービスアカウントにスプレッドシートへの編集権限を付与してください');
    }
    process.exit(1);
  });
}

module.exports = main;
