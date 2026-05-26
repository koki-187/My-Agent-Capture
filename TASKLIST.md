# MAC セットアップ進捗チェックリスト

## フェーズ 1: 事前準備

- [ ] GCP プロジェクト作成
- [ ] Google Sheets API 有効化
- [ ] Google Drive API 有効化
- [ ] サービスアカウント作成・JSONキー取得
- [ ] Google スプレッドシート新規作成
- [ ] スプレッドシートをサービスアカウントと共有
- [ ] Google Drive フォルダ新規作成
- [ ] Driveフォルダをサービスアカウントと共有
- [ ] Gemini API キー取得
- [ ] LINE 公式アカウント作成
- [ ] LINE チャンネルアクセストークン発行

## フェーズ 2: インストール・設定

- [ ] `npm install` 実行
- [ ] `.env` ファイル設定 (全必須項目)
- [ ] `service-account.json` 配置

## フェーズ 3: Google サービス初期化

- [ ] `npm run setup:sheets` — スプレッドシート初期化
- [ ] `npm run setup:drive` — Drive フォルダ作成
- [ ] `npm run setup:check` — 設定確認 (全 ✓)

## フェーズ 4: LINE 設定

- [ ] サーバー起動 (`npm start`)
- [ ] ngrok または本番サーバーで URL 取得
- [ ] LINE Developers で Webhook URL 設定
- [ ] `npm run setup:richmenu` — Rich Menu 設定 (オプション)

## フェーズ 5: 動作確認

- [ ] LINE に物件PDF を送信してテスト
- [ ] スプレッドシートに行が追加されることを確認
- [ ] Drive フォルダにファイルがアップロードされることを確認
- [ ] 物件概要書 PDF が生成されることを確認
- [ ] `npm run setup:check` で完了率 100% を確認

---

完了したら `npm run setup:check` を実行して全項目が ✓ であることを確認してください。
