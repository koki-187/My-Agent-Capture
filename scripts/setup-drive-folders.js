#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env'), override: true });

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TYPE_FOLDER_NAMES = [
  '戸建て',
  '古家あり',
  '低層マンション',
  '一棟レジデンス',
  '一棟ビル',
  '空き地',
  'ロードサイド付き使用地',
  '中古マンション',
  '物件概要書',
  '物件資料',
];

function getAuth() {
  const keyPath = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: { client_email: key.client_email, private_key: key.private_key },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

async function getOrCreateFolder(drive, name, parentId) {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const res = await drive.files.list({ q: query, fields: 'files(id,name)', spaces: 'drive' });
  const existing = res.data.files?.[0];
  if (existing?.id) {
    console.log(`  ✓ 既存: ${name} (${existing.id})`);
    return existing.id;
  }

  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });
  console.log(`  ✓ 作成: ${name} (${createRes.data.id})`);
  return createRes.data.id;
}

async function main() {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    console.error('✗ GOOGLE_DRIVE_ROOT_FOLDER_ID が未設定です');
    process.exit(1);
  }

  console.log('Google Drive フォルダ構造を作成します...');
  console.log(`ルートフォルダ: ${rootFolderId}\n`);

  const drive = google.drive({ version: 'v3', auth: getAuth() });

  for (const name of TYPE_FOLDER_NAMES) {
    await getOrCreateFolder(drive, name, rootFolderId);
  }

  console.log(`\n✓ Drive フォルダ構造のセットアップが完了しました (${TYPE_FOLDER_NAMES.length} フォルダ)`);
}

if (require.main === module) {
  main().catch(e => {
    console.error('✗ エラー:', e.message);
    process.exit(1);
  });
}

module.exports = main;
