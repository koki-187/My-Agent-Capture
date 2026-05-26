# MAC セットアップガイド (詳細版)

## 1. Google Cloud Platform 設定

### 1-1. プロジェクト作成
1. [GCP Console](https://console.cloud.google.com/) を開く
2. 新しいプロジェクトを作成 (例: `mac-agent`)

### 1-2. API 有効化
以下のAPIを有効化してください:
- Google Sheets API
- Google Drive API

### 1-3. サービスアカウント作成
1. 「IAMと管理」→「サービスアカウント」→「作成」
2. 名前: `mac-agent` など
3. 役割: 「編集者」または個別権限 (Sheets/Drive)
4. キーを作成 (JSON形式) → ダウンロード
5. ダウンロードしたJSONを `service-account.json` という名前でプロジェクトルートに配置

---

## 2. Google スプレッドシート設定

### 2-1. 新規スプレッドシート作成
1. [Google Sheets](https://sheets.google.com/) で新規作成
2. URLから ID をコピー:
   `https://docs.google.com/spreadsheets/d/【ここがID】/edit`

### 2-2. サービスアカウントへの共有
1. スプレッドシートを開く
2. 「共有」ボタン → サービスアカウントのメールアドレスを追加
3. 権限: 「編集者」

### 2-3. 初期化
```bash
npm run setup:sheets
```
自動で28列のヘッダーと8種別シートが作成されます。

---

## 3. Google Drive 設定

### 3-1. ルートフォルダ作成
1. [Google Drive](https://drive.google.com/) で新規フォルダを作成
2. 名前: `MAC_物件管理` など (任意)
3. フォルダURLから ID をコピー:
   `https://drive.google.com/drive/folders/【ここがID】`

### 3-2. サービスアカウントへの共有
1. フォルダを右クリック →「共有」
2. サービスアカウントのメールアドレスを追加
3. 権限: 「編集者」

### 3-3. サブフォルダ作成
```bash
npm run setup:drive
```
8種別のサブフォルダが自動作成されます。

---

## 4. Gemini API 設定

1. [Google AI Studio](https://aistudio.google.com/) を開く
2. 「Get API key」→ APIキーを作成
3. `.env` に設定:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

---

## 5. LINE 公式アカウント設定

### 5-1. チャンネル作成
1. [LINE Developers](https://developers.line.biz/) を開く
2. 「Messaging API」チャンネルを作成
3. 「Channel access token」を発行 (Long-lived)
4. 「Channel secret」をコピー

### 5-2. Webhook 設定
1. Webhook URL に `https://あなたのドメイン/webhook` を入力
2. 「Use webhook」を ON

### 5-3. .env に設定
```
LINE_CHANNEL_ACCESS_TOKEN=your_token_here
LINE_CHANNEL_SECRET=your_secret_here
```

---

## 6. 環境変数の設定

`.env` ファイルを編集して全ての値を設定:

```env
# LINE
LINE_CHANNEL_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
LINE_CHANNEL_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account.json
GOOGLE_SPREADSHEET_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_DRIVE_ROOT_FOLDER_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# アプリ設定
AGENT_NAME=あなたの名前
COMPANY_NAME=あなたの会社名
PORT=3000
```

---

## 7. サーバー起動

### 開発環境
```bash
npm run dev
```

### 本番環境
```bash
npm run build
npm start
```

### 常時起動 (PM2使用)
```bash
npm install -g pm2
pm2 start dist/index.js --name mac-agent
pm2 startup
pm2 save
```

---

## 8. ngrok でローカルテスト

本番環境がない場合、ngrok を使用してローカルでテストできます:

```bash
npm install -g ngrok
ngrok http 3000
```

表示された `https://xxxx.ngrok.io` を LINE Webhook URL に設定してください。

---

## 9. セットアップ確認

```bash
npm run setup:check
```

全チェックが ✓ になればセットアップ完了です。

---

## トラブルシューティング

### Q: LINE から返信が来ない
- Webhook URL が正しく設定されているか確認
- サーバーが起動しているか確認
- `npm run setup:check` でエラーを確認

### Q: スプレッドシートに書き込まれない
- サービスアカウントにスプレッドシートの編集権限があるか確認
- GOOGLE_SPREADSHEET_ID が正しいか確認

### Q: OCR の精度が低い
- 画像の解像度を上げる
- PDF の場合はテキスト埋め込みがあると精度向上
