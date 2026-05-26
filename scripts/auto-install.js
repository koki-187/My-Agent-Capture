#!/usr/bin/env node
/**
 * MAC (My Agent Capture) 自動セットアップスクリプト
 * npm run setup で実行
 */
'use strict';

const path = require('path');
const fs = require('fs');

// ステップごとの色付きログ
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }
function err(msg) { console.log(`${c.red}✗${c.reset} ${msg}`); }
function info(msg) { console.log(`${c.cyan}ℹ${c.reset} ${msg}`); }
function header(msg) { console.log(`\n${c.bold}${c.blue}${msg}${c.reset}`); }

async function main() {
  const args = process.argv.slice(2);

  // サブコマンド処理
  if (args[0] === 'check') {
    return require('./setup-check');
  }
  if (args[0] === 'verify') {
    return require('./verify-completion');
  }
  if (args[0] === 'sheets') {
    return require('./setup-sheets');
  }
  if (args[0] === 'drive') {
    return require('./setup-drive-folders');
  }
  if (args[0] === 'richmenu') {
    return require('./setup-line-richmenu');
  }
  if (args[0] === 'env') {
    return require('./write-env');
  }

  // メインセットアップフロー
  console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════╗
║   MAC - My Agent Capture セットアップ     ║
╚══════════════════════════════════════════╝${c.reset}`);

  log('\nこのスクリプトはMACの初期セットアップを行います。');
  log('以下の手順を順番に実行します:\n');
  log('  1. 環境変数ファイル (.env) の確認・作成');
  log('  2. Google Service Account キーの確認');
  log('  3. Google Spreadsheet の初期化');
  log('  4. Google Drive フォルダ構造の作成');
  log('  5. LINE Rich Menu の設定 (オプション)');
  log('  6. セットアップ完了確認\n');

  // Step 1: .env チェック
  header('Step 1: 環境変数ファイルの確認');
  const envPath = path.resolve(process.cwd(), '.env');
  const envExamplePath = path.resolve(process.cwd(), '.env.example');

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      ok('.env.example を .env にコピーしました');
      warn('.env を開いて必要な値を設定してください:');
      log('  - LINE_CHANNEL_ACCESS_TOKEN');
      log('  - LINE_CHANNEL_SECRET');
      log('  - GOOGLE_SPREADSHEET_ID');
      log('  - GOOGLE_DRIVE_ROOT_FOLDER_ID');
      log('  - GEMINI_API_KEY');
      log('  - GOOGLE_SERVICE_ACCOUNT_KEY_PATH\n');
      warn('設定が完了したら再度 npm run setup を実行してください。');
      process.exit(0);
    } else {
      err('.env.example が見つかりません。プロジェクトを再インストールしてください。');
      process.exit(1);
    }
  } else {
    ok('.env ファイルが存在します');
  }

  // .env を読み込む
  require('dotenv').config({ path: envPath, override: true });

  // Step 2: 必須環境変数チェック
  header('Step 2: 環境変数の確認');
  const required = [
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'GOOGLE_SPREADSHEET_ID',
    'GOOGLE_DRIVE_ROOT_FOLDER_ID',
    'GEMINI_API_KEY',
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  ];

  let missingVars = [];
  for (const key of required) {
    if (!process.env[key]) {
      err(`未設定: ${key}`);
      missingVars.push(key);
    } else {
      ok(`設定済み: ${key}`);
    }
  }

  if (missingVars.length > 0) {
    warn(`\n.env に ${missingVars.length} 件の未設定項目があります。`);
    warn('.env を編集して値を設定した後、再度実行してください。');
    log(`\n.env の場所: ${envPath}`);
    process.exit(1);
  }

  // Step 3: Service Account キー確認
  header('Step 3: Service Account キーの確認');
  const keyPath = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
  if (!fs.existsSync(keyPath)) {
    err(`Service Account キーが見つかりません: ${keyPath}`);
    log('\nGCPコンソールでサービスアカウントを作成し、JSONキーをダウンロードしてください。');
    log('参考: https://cloud.google.com/iam/docs/service-accounts-create');
    process.exit(1);
  }
  try {
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    ok(`Service Account: ${key.client_email}`);
  } catch {
    err('Service Account JSONが無効です。ファイルを確認してください。');
    process.exit(1);
  }

  // Step 4: Spreadsheet セットアップ
  header('Step 4: Google Spreadsheet の初期化');
  try {
    await runScript('./setup-sheets');
  } catch (e) {
    err(`Spreadsheet セットアップ失敗: ${e.message}`);
    log('手動で npm run setup:sheets を実行してください。');
  }

  // Step 5: Drive フォルダセットアップ
  header('Step 5: Google Drive フォルダ構造の作成');
  try {
    await runScript('./setup-drive-folders');
  } catch (e) {
    err(`Drive フォルダセットアップ失敗: ${e.message}`);
    log('手動で npm run setup:drive を実行してください。');
  }

  // Step 6: LINE Rich Menu
  header('Step 6: LINE Rich Menu の設定');
  try {
    info('Rich Menu 画像を生成中...');
    await runScript('./generate-richmenu-image');
    info('Rich Menu をLINEに登録中...');
    await runScript('./setup-line-richmenu');
  } catch (e) {
    warn(`Rich Menu 設定をスキップしました: ${e.message}`);
    info('後から npm run setup:richmenu で設定できます。');
  }

  // Step 7: 完了確認
  header('Step 7: セットアップ完了確認');
  try {
    await runScript('./verify-completion');
  } catch (e) {
    warn('完了確認スクリプトの実行に失敗しました。');
  }

  console.log(`\n${c.bold}${c.green}╔══════════════════════════════════════════╗
║      セットアップが完了しました！         ║
╚══════════════════════════════════════════╝${c.reset}`);

  log('\n次のステップ:');
  log('  1. npm start でサーバーを起動');
  log('  2. LINE Developers コンソールでWebhook URLを設定');
  log('     例: https://your-domain.com/webhook');
  log('  3. LINE公式アカウントに物件資料を送信してテスト\n');
}

async function runScript(scriptPath) {
  // require が同期的に実行される場合と、async main を持つ場合を両方サポート
  delete require.cache[require.resolve(scriptPath)];
  const mod = require(scriptPath);
  if (typeof mod === 'function') {
    await mod();
  } else if (mod && typeof mod.main === 'function') {
    await mod.main();
  }
}

main().catch(e => {
  console.error(`\n${c.red}エラーが発生しました:${c.reset}`, e.message);
  process.exit(1);
});
