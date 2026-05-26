#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env'), override: true });

const fs = require('fs');
const path = require('path');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
};

const checks = [
  { label: '.env ファイル', weight: 10, check: () => fs.existsSync(path.resolve(process.cwd(), '.env')) },
  { label: 'Service Account JSONキー', weight: 15, check: () => {
    const p = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    return p && fs.existsSync(path.resolve(process.cwd(), p));
  }},
  { label: 'LINE_CHANNEL_ACCESS_TOKEN', weight: 10, check: () => !!process.env.LINE_CHANNEL_ACCESS_TOKEN },
  { label: 'LINE_CHANNEL_SECRET', weight: 10, check: () => !!process.env.LINE_CHANNEL_SECRET },
  { label: 'GOOGLE_SPREADSHEET_ID', weight: 10, check: () => !!process.env.GOOGLE_SPREADSHEET_ID },
  { label: 'GOOGLE_DRIVE_ROOT_FOLDER_ID', weight: 10, check: () => !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID },
  { label: 'GEMINI_API_KEY', weight: 10, check: () => !!process.env.GEMINI_API_KEY },
  { label: 'templates/standard.html', weight: 10, check: () => fs.existsSync(path.resolve(process.cwd(), 'templates', 'standard.html')) },
  { label: 'src ソースファイル', weight: 10, check: () => {
    const files = ['src/index.ts', 'src/app.ts', 'src/handlers/webhook.handler.ts'];
    return files.every(f => fs.existsSync(path.resolve(process.cwd(), f)));
  }},
  { label: 'WEBHOOK_URL 設定', weight: 5, check: () => !!process.env.WEBHOOK_URL },
];

function main() {
  console.log(`\n${c.bold}MAC セットアップ完了率${c.reset}\n`);

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const item of checks) {
    totalWeight += item.weight;
    let passed = false;
    try { passed = !!item.check(); } catch { passed = false; }
    earnedWeight += passed ? item.weight : 0;

    const icon = passed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    const pct = `[${item.weight}%]`;
    console.log(`  ${icon} ${pct.padEnd(6)} ${item.label}`);
  }

  const completion = Math.round((earnedWeight / totalWeight) * 100);
  console.log(`\n${c.bold}完了率: ${completion}% (${earnedWeight}/${totalWeight}点)${c.reset}`);

  if (completion === 100) {
    console.log(`${c.green}✓ セットアップ完了！npm start でサーバーを起動できます。${c.reset}`);
  } else if (completion >= 70) {
    console.log(`${c.yellow}⚠ もう少しです。残りの項目を設定してください。${c.reset}`);
  } else {
    console.log(`${c.red}✗ セットアップが未完了です。npm run setup を実行してください。${c.reset}`);
  }

  return completion;
}

if (require.main === module) {
  main();
}

module.exports = main;
