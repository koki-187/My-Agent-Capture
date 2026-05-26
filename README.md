# MAC - My Agent Capture

> 不動産エージェント向け物件資料自動キャプチャ・管理システム

LINEに物件資料（PDF・画像）を送るだけで、**OCR自動読み取り → スプレッドシート登録 → Driveファイル整理 → 物件概要書PDF生成**まで全自動で処理します。

## 機能

| 機能 | 説明 |
|---|---|
| 📤 LINE受信 | 物件PDF・画像をLINE公式アカウントで受信 |
| 🔍 Gemini OCR | AI(Gemini 2.5 Flash)が物件情報を自動読み取り |
| 📊 スプレッドシート | 28項目を案件表に自動登録、種別シートにも同期 |
| 📁 Drive整理 | 物件種別ごとのフォルダに自動分類・保存 |
| 📄 概要書生成 | A4 PDF形式の物件概要書を自動生成 |
| 🔎 情報補完 | 住所から用途地域・最寄り駅を自動調査 |

## 必要なもの

- Node.js 18以上
- LINE公式アカウント（Messaging API）
- Google アカウント（Spreadsheet + Drive）
- Gemini API キー

## セットアップ (3ステップ)

### Step 1: インストール
```bash
git clone https://github.com/koki-187/My-Agent-Capture.git
cd My-Agent-Capture
npm install
```

### Step 2: 設定ウィザード
```bash
npm run setup
```
対話式で以下を自動設定します:
- `.env` ファイル作成
- Google Spreadsheet 初期化（28列ヘッダー・種別シート・ドロップダウン）
- Google Drive フォルダ構造作成
- LINE Rich Menu 設定・画像アップロード

### Step 3: サーバー起動
```bash
npm start
```
LINE DevelopersコンソールでWebhook URLを設定:
```
https://あなたのドメイン/webhook
```

## コマンド

| コマンド | 説明 |
|---|---|
| `npm run setup` | 全体セットアップウィザード |
| `npm run setup:sheets` | スプレッドシート初期化のみ |
| `npm run setup:drive` | Driveフォルダ作成のみ |
| `npm run setup:richmenu` | LINE Rich Menu設定のみ |
| `npm run setup:richmenu:image` | Rich Menu画像生成のみ |
| `npm run setup:check` | 設定診断 |
| `npm start` | 本番起動 |
| `npm run dev` | 開発サーバー（ホットリロード） |

## スプレッドシート構成

| シート | 用途 |
|---|---|
| 案件表_台帳 | 全物件の統合台帳（28列） |
| 戸建て / 古家あり / ... | 種別別サマリー（8シート） |
| 処理ログ | 自動処理のログ |
| 設定 | システム設定 |

## 技術スタック

- **Runtime**: Node.js + TypeScript
- **AI/OCR**: Google Gemini 2.5 Flash
- **LINE**: @line/bot-sdk v9 (Messaging API)
- **Google**: googleapis (Sheets v4 + Drive v3)
- **PDF生成**: Puppeteer + Handlebars
- **情報補完**: 国土交通省 不動産情報ライブラリ API / HeartRails Express API

## ライセンス

MIT
