# MAC - My Agent Capture

不動産エージェント向け物件資料自動キャプチャシステム。LINEで物件資料(PDF/画像)を送ると、Gemini OCRで解析→Googleスプレッドシートに登録→Google Driveにファイル保存→物件概要書PDF生成までを自動化する。

## アーキテクチャ

```
LINE Webhook → webhook.handler.ts → message.handler.ts
  → gemini.service.ts (OCR)
  → research.service.ts (情報補完: GSI/HeartRails/NLFTP/Gemini)
  → sheets.service.ts (スプレッドシート登録)
  → drive.service.ts (Driveアップロード)
  → generator.service.ts (物件概要書PDF生成)
  → line.service.ts (結果をLINE push通知)
```

## 主要設定

- **案件IDフォーマット**: `MAC-YYYYMMDD-XXXX`
- **スプレッドシート列数**: 28列 (A〜AB)
- **物件種別**: 戸建て / 古家あり / 低層マンション / 一棟レジデンス / 一棟ビル / 空き地 / ロードサイド付き使用地 / 中古マンション
- **OCRモデル**: Gemini 2.5 Flash (2ステージ: テキスト抽出→JSON構造化)
- **テンプレートエンジン**: Handlebars + Puppeteer (A4 PDF)

## ファイル構成

```
src/
  config/index.ts          — 全定数 (COL, LEDGER_HEADERS, ENV, API_CONFIG等)
  types/property.ts        — PropertyListing, OcrExtractedData, CaseStatus型
  handlers/
    webhook.handler.ts     — LINE署名検証 + イベントディスパッチ
    message.handler.ts     — メイン処理パイプライン
  services/
    gemini.service.ts      — Gemini OCR (extractFromFile)
    sheets.service.ts      — Google Sheets操作
    drive.service.ts       — Google Drive操作
    line.service.ts        — LINE API (reply/push/getContent)
    research.service.ts    — 不足情報補完 (geocode/station/zoning)
    generator.service.ts   — 物件概要書PDF生成
scripts/                   — セットアップスクリプト (CommonJS)
templates/                 — Handlebars HTMLテンプレート (standard.html, premium.html)
```

## セットアップ

```bash
npm install
npm run setup        # 対話的セットアップウィザード
npm run setup:check  # 設定診断
npm start            # 本番起動
npm run dev          # 開発 (ホットリロード)
```

## 環境変数 (.env 必須項目)

| キー | 説明 |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API トークン |
| `LINE_CHANNEL_SECRET` | LINE チャンネルシークレット |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | サービスアカウントJSONパス (例: ./service-account.json) |
| `GOOGLE_SPREADSHEET_ID` | 案件表スプレッドシートID |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | DriveルートフォルダID |
| `GEMINI_API_KEY` | Gemini API キー |

## コーディング規約

- 全ファイル TypeScript strict モード
- サービスは関数エクスポート (クラス不使用)
- Google API認証は毎回 `loadServiceAccountKey()` + `GoogleAuth` で生成
- エラーは握りつぶさず `logger.error()` + `writeLog()` で記録
- 台帳列番号は必ず `COL.XXX` 定数を使用 (マジックナンバー禁止)

## テンプレート変数 (templates/*.html)

`{{caseId}}`, `{{propertyName}}`, `{{propertyType}}`, `{{address}}`, `{{area}}`, `{{priceMlanEn}}`, `{{landAreaM2}}`, `{{buildingAreaM2}}`, `{{nearestStation}}`, `{{walkMinutes}}`, `{{zoningUse}}`, `{{coverageRatio}}`, `{{floorAreaRatio}}`, `{{tsuboPrice}}`, `{{tsuboPriceType}}`, `{{currentRentYen}}`, `{{grossYield}}`, `{{notes}}`, `{{driveFolderUrl}}`, `{{agentName}}`, `{{companyName}}`, `{{generatedDate}}`
