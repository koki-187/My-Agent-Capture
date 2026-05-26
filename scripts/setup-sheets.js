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
