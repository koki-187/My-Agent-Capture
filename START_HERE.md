# MAC (My Agent Capture) — はじめに

LINEで物件資料を送るだけで、自動でスプレッドシートに記録・Drive整理・概要書生成まで行う不動産エージェント向けワークフローシステムです。

## クイックスタート (5ステップ)

### Step 1: 前提条件の準備

以下のアカウントとAPIキーを用意してください:

| 必要なもの | 取得場所 |
|---|---|
| LINE公式アカウント + チャンネルアクセストークン | [LINE Developers](https://developers.line.biz/) |
| Google Serviceアカウント JSON | [GCP Console](https://console.cloud.google.com/) |
| Google スプレッドシート (新規作成) | [Google Sheets](https://sheets.google.com/) |
| Google Drive フォルダ (新規作成) | [Google Drive](https://drive.google.com/) |
| Gemini API キー | [Google AI Studio](https://aistudio.google.com/) |

### Step 2: インストール

```bash
npm install
```

### Step 3: セットアップ実行

```bash
npm run setup
```

対話的にセットアップが進みます。指示に従って `.env` ファイルに各種キーを入力してください。

### Step 4: サーバー起動

```bash
npm start
```

### Step 5: Webhook URL を LINE に設定

サーバーが起動したら、LINE Developers コンソールで Webhook URL を設定:
```
https://あなたのドメイン/webhook
```

## 使い方

1. LINE公式アカウントに **物件資料 (PDF または画像)** を送信
2. 自動処理が開始 → 「処理中です...」と返信
3. 完了すると案件IDとフォルダURLが返信
4. スプレッドシートに自動登録済み

## 詳細ガイド

詳しいセットアップ手順は [SETUP_GUIDE.md](SETUP_GUIDE.md) を参照してください。

## コマンド一覧

| コマンド | 説明 |
|---|---|
| `npm run setup` | 全体セットアップ (初回推奨) |
| `npm run setup:check` | 設定診断 |
| `npm run setup:sheets` | スプレッドシート初期化のみ |
| `npm run setup:drive` | Driveフォルダ作成のみ |
| `npm run setup:richmenu` | LINE Rich Menu 設定 |
| `npm start` | 本番サーバー起動 |
| `npm run dev` | 開発サーバー起動 (ホットリロード) |
| `npm run build` | TypeScript ビルド |
