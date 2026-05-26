#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env'), override: true });

const https = require('https');

function linePost(endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.line.me',
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function lineDelete(endpoint, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      path: endpoint,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.end();
  });
}

function lineGet(endpoint, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      path: endpoint,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const RICH_MENU_DEFINITION = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: 'MAC Rich Menu',
  chatBarText: 'メニュー',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: {
        type: 'message',
        label: '物件資料を送る',
        text: '物件資料を送ります',
      },
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: {
        type: 'message',
        label: '案件一覧',
        text: '案件一覧を表示',
      },
    },
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: {
        type: 'message',
        label: '使い方',
        text: '使い方を教えてください',
      },
    },
    {
      bounds: { x: 833, y: 843, width: 834, height: 843 },
      action: {
        type: 'uri',
        label: 'スプレッドシート',
        uri: process.env.GOOGLE_SPREADSHEET_ID
          ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID}/edit`
          : 'https://sheets.google.com',
      },
    },
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: {
        type: 'uri',
        label: 'Driveフォルダ',
        uri: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
          ? `https://drive.google.com/drive/folders/${process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID}`
          : 'https://drive.google.com',
      },
    },
  ],
};

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('✗ LINE_CHANNEL_ACCESS_TOKEN が未設定です');
    process.exit(1);
  }

  console.log('LINE Rich Menu を設定します...\n');

  // 既存のリッチメニューを取得
  console.log('既存のリッチメニューを確認中...');
  const listRes = await lineGet('/v2/bot/richmenu/list', token);

  if (listRes.status === 200 && listRes.data.richmenus?.length > 0) {
    console.log(`  既存のリッチメニュー: ${listRes.data.richmenus.length} 件`);
    for (const menu of listRes.data.richmenus) {
      if (menu.name === 'MAC Rich Menu') {
        console.log(`  既存の MAC Rich Menu を削除: ${menu.richMenuId}`);
        await lineDelete(`/v2/bot/richmenu/${menu.richMenuId}`, token);
      }
    }
  }

  // 新しいリッチメニューを作成
  console.log('\nリッチメニューを作成中...');
  const createRes = await linePost('/v2/bot/richmenu', RICH_MENU_DEFINITION, token);

  if (createRes.status !== 200) {
    console.error(`✗ リッチメニューの作成に失敗しました (${createRes.status})`);
    console.error('  ', JSON.stringify(createRes.data));

    console.log('\n手動設定の手順:');
    console.log('  1. LINE Official Account Manager を開く');
    console.log('     https://manager.line.biz/');
    console.log('  2. 「チャット」→「リッチメニュー」から手動で設定してください');
    return;
  }

  const richMenuId = createRes.data.richMenuId;
  console.log(`✓ リッチメニュー作成: ${richMenuId}`);

  // デフォルトに設定
  console.log('デフォルトリッチメニューに設定中...');
  const setDefaultRes = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      path: `/v2/bot/user/all/richmenu/${richMenuId}`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Length': 0 },
    };
    const req = https.request(options, (res) => {
      resolve({ status: res.statusCode });
    });
    req.on('error', reject);
    req.end();
  });

  if (setDefaultRes.status === 200) {
    console.log('✓ デフォルトリッチメニューとして設定しました');
  } else {
    console.log(`⚠ デフォルト設定: ステータス ${setDefaultRes.status}`);
    console.log(`  LINE Official Account Manager で手動設定も可能です`);
  }

  console.log(`
✓ LINE Rich Menu の設定が完了しました！

注意: リッチメニューの画像は LINE Official Account Manager から
別途アップロードしてください。
  URL: https://manager.line.biz/

リッチメニューID: ${richMenuId}
`);
}

if (require.main === module) {
  main().catch(e => {
    console.error('✗ エラー:', e.message);
    if (e.message.includes('401') || e.message.includes('Unauthorized')) {
      console.error('  → LINE_CHANNEL_ACCESS_TOKEN を確認してください');
    }
    process.exit(1);
  });
}

module.exports = main;
