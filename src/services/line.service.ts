import { messagingApi } from '@line/bot-sdk';
import { ENV } from '../config';
import logger from '../utils/logger';

let _client: messagingApi.MessagingApiClient | null = null;
let _blobClient: messagingApi.MessagingApiBlobClient | null = null;

function getClient(): messagingApi.MessagingApiClient {
  if (!_client) {
    _client = new messagingApi.MessagingApiClient({
      channelAccessToken: ENV.LINE_CHANNEL_ACCESS_TOKEN,
    });
  }
  return _client;
}

function getBlobClient(): messagingApi.MessagingApiBlobClient {
  if (!_blobClient) {
    _blobClient = new messagingApi.MessagingApiBlobClient({
      channelAccessToken: ENV.LINE_CHANNEL_ACCESS_TOKEN,
    });
  }
  return _blobClient;
}

export async function replyText(replyToken: string, text: string): Promise<void> {
  try {
    const client = getClient();
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
  } catch (e: any) {
    logger.error(`LINE返信失敗: ${e.message}`);
  }
}

export async function replyMessages(replyToken: string, messages: messagingApi.Message[]): Promise<void> {
  try {
    const client = getClient();
    await client.replyMessage({ replyToken, messages });
  } catch (e: any) {
    logger.error(`LINE複数返信失敗: ${e.message}`);
  }
}

export async function getMessageContent(messageId: string): Promise<Buffer> {
  const blobClient = getBlobClient();
  const response = await blobClient.getMessageContent(messageId);
  const chunks: Buffer[] = [];
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function pushMessage(userId: string, messages: messagingApi.Message[]): Promise<void> {
  try {
    const client = getClient();
    await client.pushMessage({ to: userId, messages });
  } catch (e: any) {
    logger.error(`LINE push失敗: ${e.message}`);
  }
}

export function buildProcessingResult(
  caseId: string,
  propertyName: string,
  folderUrl: string,
  overviewUrl?: string
): messagingApi.Message[] {
  const messages: messagingApi.Message[] = [];

  // Main result as Flex Message
  const flexMessage: messagingApi.FlexMessage = {
    type: 'flex',
    altText: `✅ 物件登録完了: ${caseId}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1a3a6e',
        contents: [
          {
            type: 'text',
            text: '✅ 物件登録完了',
            color: '#ffffff',
            weight: 'bold',
            size: 'lg',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '案件ID', color: '#888888', size: 'sm', flex: 2 },
              { type: 'text', text: caseId, color: '#111111', size: 'sm', flex: 5, weight: 'bold' },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '物件名', color: '#888888', size: 'sm', flex: 2 },
              { type: 'text', text: propertyName || '(未取得)', color: '#111111', size: 'sm', flex: 5, wrap: true },
            ],
          },
          { type: 'separator' },
          {
            type: 'text',
            text: '自動処理完了:',
            color: '#555555',
            size: 'xs',
          },
          {
            type: 'text',
            text: '✓ スプレッドシート登録\n✓ Driveフォルダ作成\n✓ 物件概要書PDF生成',
            color: '#2d7a2d',
            size: 'xs',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '📁 Driveフォルダを開く',
              uri: folderUrl,
            },
            style: 'primary',
            color: '#1a3a6e',
            height: 'sm',
          },
          ...(overviewUrl ? [{
            type: 'button' as const,
            action: {
              type: 'uri' as const,
              label: '📄 物件概要書PDFを開く',
              uri: overviewUrl,
            },
            style: 'secondary' as const,
            height: 'sm' as const,
          }] : []),
        ],
      },
    },
  };

  messages.push(flexMessage);
  return messages;
}

export function buildErrorMessage(errorType: string): messagingApi.Message {
  const messages: Record<string, string> = {
    no_text: '物件資料の画像またはPDFを送信してください。',
    ocr_failed: '資料の読み取りに失敗しました。\n画像が鮮明かご確認ください。',
    sheets_failed: 'スプレッドシートへの登録に失敗しました。\n設定をご確認ください。',
    drive_failed: 'Driveへのファイル保存に失敗しました。\n設定をご確認ください。',
    general: '処理中にエラーが発生しました。\n時間をおいて再送信してください。',
  };

  return { type: 'text', text: messages[errorType] || messages.general };
}
