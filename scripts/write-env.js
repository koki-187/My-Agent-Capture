#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env');

const args = process.argv.slice(2);

if (args[0] === '--init') {
  // .env が存在しない場合のみコピー
  const examplePath = path.resolve(process.cwd(), '.env.example');
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
      console.log('✓ .env を作成しました (.env.example からコピー)');
    } else {
      console.error('✗ .env.example が見つかりません');
      process.exit(1);
    }
  } else {
    console.log('ℹ .env はすでに存在します (スキップ)');
  }
  process.exit(0);
}

if (args[0] === '--set' && args[1]) {
  // KEY=VALUE 形式で安全に書き込む
  const [key, ...rest] = args[1].split('=');
  const value = rest.join('=');

  if (!key) {
    console.error('使用方法: node write-env.js --set KEY=VALUE');
    process.exit(1);
  }

  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = content.split('\n');
  const keyLine = `${key}=${value}`;
  const existingIndex = lines.findIndex(l => l.startsWith(`${key}=`));

  if (existingIndex >= 0) {
    lines[existingIndex] = keyLine;
    console.log(`✓ ${key} を更新しました`);
  } else {
    lines.push(keyLine);
    console.log(`✓ ${key} を追加しました`);
  }

  fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
  process.exit(0);
}

if (args[0] === '--get' && args[1]) {
  require('dotenv').config({ path: envPath, override: true });
  const val = process.env[args[1]];
  if (val) {
    console.log(val);
  } else {
    process.exit(1);
  }
  process.exit(0);
}

// デフォルト: 現在の .env 内容を表示 (センシティブ値はマスク)
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
  const SENSITIVE = ['TOKEN', 'SECRET', 'KEY', 'PASSWORD', 'PASS'];
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    if (!line || line.startsWith('#')) {
      console.log(line);
      return;
    }
    const [k, ...v] = line.split('=');
    const val = v.join('=');
    const isSensitive = SENSITIVE.some(s => k.toUpperCase().includes(s));
    if (isSensitive && val) {
      console.log(`${k}=${'*'.repeat(Math.min(val.length, 12))}`);
    } else {
      console.log(line);
    }
  });
} else {
  console.log('.env ファイルが存在しません。npm run setup を実行してください。');
}
