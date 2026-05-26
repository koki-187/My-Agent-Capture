#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

async function main() {
  // Puppeteer is in dependencies
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.error('✗ puppeteer が見つかりません。npm install を実行してください。');
    process.exit(1);
  }

  const htmlPath = path.resolve(process.cwd(), 'assets', 'richmenu.html');
  const outPath = path.resolve(process.cwd(), 'assets', 'richmenu.png');

  if (!fs.existsSync(htmlPath)) {
    console.error(`✗ テンプレートが見つかりません: ${htmlPath}`);
    process.exit(1);
  }

  console.log('Rich Menu 画像を生成中...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 2500, height: 1686, deviceScaleFactor: 1 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width: 2500, height: 1686 } });
    console.log(`✓ Rich Menu 画像を生成しました: ${outPath}`);
    console.log(`  サイズ: ${Math.round(fs.statSync(outPath).size / 1024)}KB`);
  } finally {
    if (browser) await browser.close();
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('✗ 画像生成エラー:', e.message);
    process.exit(1);
  });
}

module.exports = main;
