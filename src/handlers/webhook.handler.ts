import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { ENV } from '../config';
import { handlePropertyDocument, handleTextMessage, MessageEvent } from './message.handler';
import logger from '../utils/logger';

function verifySignature(body: Buffer, signature: string): boolean {
  const channelSecret = ENV.LINE_CHANNEL_SECRET;
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-line-signature'] as string;
  const rawBody = req.body as Buffer;

  if (!signature) {
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  if (!verifySignature(rawBody, signature)) {
    logger.warn('LINE署名検証失敗');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Immediately return 200 to LINE
  res.status(200).json({ ok: true });

  let body: any;
  try {
    body = JSON.parse(rawBody.toString('utf-8'));
  } catch (e) {
    logger.error('Webhook bodyパース失敗');
    return;
  }

  const events = body.events || [];

  await Promise.allSettled(
    events.map(event =>
      processLineEvent(event).catch((e: any) =>
        logger.error(`イベント処理エラー: ${e.message}`, { eventType: event.type })
      )
    )
  );
}

async function processLineEvent(event: any): Promise<void> {
  const replyToken = event.replyToken || '';
  const userId = event.source?.userId || 'unknown';

  if (event.type !== 'message') return;

  const message = event.message;

  switch (message.type) {
    case 'image': {
      const msgEvent: MessageEvent = {
        replyToken,
        userId,
        messageId: message.id,
        messageType: 'image',
        mimeType: 'image/jpeg',
        fileName: `image_${message.id}.jpg`,
      };
      await handlePropertyDocument(msgEvent);
      break;
    }

    case 'file': {
      const msgEvent: MessageEvent = {
        replyToken,
        userId,
        messageId: message.id,
        messageType: 'file',
        mimeType: message.fileName?.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
        fileName: message.fileName || `file_${message.id}`,
      };
      await handlePropertyDocument(msgEvent);
      break;
    }

    case 'text': {
      const msgEvent: MessageEvent = {
        replyToken,
        userId,
        messageId: message.id,
        messageType: 'text',
        text: message.text,
      };
      await handleTextMessage(msgEvent);
      break;
    }

    default:
      logger.debug(`未対応メッセージタイプ: ${message.type}`);
  }
}
