#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env'), override: true });

const fs = require('fs');
const path = require('path');
const https = require('https');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
};

function ok(msg) { console.log(`  ${c.green}✓${c.reset} ${msg}`); }
function warn(msg) { console.log(`  ${c.yellow}⚠${c.reset} ${msg}`); }
function fail(msg) { console.log(`  ${c.red}✗${c.reset} ${msg}`); }

async function checkHttpGet(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      resolve({ ok: res.statusCode < 400, status: res.statusCode });
    });
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }); });
  });
}

async function main() {
  console.log(`\n${c.bold}MAC セットアップ診断${c.reset}\n`);

  let totalChecks = 0;
  let passedChecks = 0;

  function check(passed, label) {
    totalChecks++;
    if (passed) { ok(label); passedChecks++; }
    else { fail(label); }
  }

  // ■ 必須ファイル
  console.log(`${c.bold}■ ファイル確認${c.reset}`);
  check(fs.existsSync(path.resolve(process.cwd(), '.env')), '.env ファイル');
  check(fs.existsSync(path.resolve(process.cwd(), 'package.json')), 'package.json');
  check(fs.existsSync(path.resolve(process.cwd(), 'src', 'index.ts')), 'src/index.ts');
  check(fs.existsSync(path.resolve(process.cwd(), 'templates', 'standard.html')), 'templates/standard.html');

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
    ? path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
    : null;
  check(keyPath && fs.existsSync(keyPath), 'Service Account JSONキー');

  // ■ 環境変数
  console.log(`\n${c.bold}■ 環境変数${c.reset}`);
  const requiredEnv = [
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'GOOGLE_SPREADSHEET_ID',
    'GOOGLE_DRIVE_ROOT_FOLDER_ID',
    'GEMINI_API_KEY',
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  ];
  for (const key of requiredEnv) {
    check(!!process.env[key], `${key}`);
  }

  const optionalEnv = ['AGENT_NAME', 'COMPANY_NAME', 'GOOGLE_MAPS_API_KEY'];
  for (const key of optionalEnv) {
    if (process.env[key]) {
      ok(`${key} (任意)`);
    } else {
      warn(`${key} 未設定 (任意)`);
    }
  }

  // ■ Service Account JSON 内容
  if (keyPath && fs.existsSync(keyPath)) {
    console.log(`\n${c.bold}■ Service Account${c.reset}`);
    try {
      const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      check(key.type === 'service_account', `type: ${key.type}`);
      check(!!key.client_email, `client_email: ${key.client_email || '(空)'}`);
      check(!!key.private_key, 'private_key: (設定済み)');
      check(!!key.project_id, `project_id: ${key.project_id || '(空)'}`);
    } catch {
      fail('Service Account JSON のパースに失敗しました');
    }
  }

  // ■ ネットワーク (基本的な接続確認)
  console.log(`\n${c.bold}■ ネットワーク${c.reset}`);
  const geminiCheck = await checkHttpGet('https://generativelanguage.googleapis.com/');
  check(geminiCheck.ok || geminiCheck.status === 404, 'Gemini API エンドポイント到達可能');

  const lineCheck = await checkHttpGet('https://api.line.me/v2/bot/info');
  check(lineCheck.ok || lineCheck.status === 401, 'LINE API エンドポイント到達可能');

  const sheetsCheck = await checkHttpGet('https://sheets.googleapis.com/');
  check(sheetsCheck.ok || sheetsCheck.status === 404, 'Google Sheets API エンドポイント到達可能');

  // ■ 結果サマリ
  console.log(`\n${c.bold}■ 診断結果${c.reset}`);
  const score = Math.round((passedChecks / totalChecks) * 100);
  if (passedChecks === totalChecks) {
    console.log(`  ${c.green}${c.bold}全チェック合格 (${passedChecks}/${totalChecks})${c.reset}`);
    console.log(`  セットアップは完了しています。npm start でサーバーを起動できます。`);
  } else {
    console.log(`  ${c.yellow}${passedChecks}/${totalChecks} チェック合格 (${score}%)${c.reset}`);
    console.log(`  未解決の項目を確認してください。`);
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('診断エラー:', e.message);
    process.exit(1);
  });
}

module.exports = main;
