import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { ENV, TYPE_TO_SHEET, loadServiceAccountKey } from '../config';
import { PropertyType } from '../types/property';
import logger from '../utils/logger';

let _driveClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (!_driveClient) {
    const key = loadServiceAccountKey() as any;
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: key.client_email,
        private_key: key.private_key,
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    _driveClient = google.drive({ version: 'v3', auth });
  }
  return _driveClient;
}

// Property type → Drive subfolder name
const TYPE_FOLDER_NAMES: Record<string, string> = {
  '戸建て': '戸建て',
  '古家あり': '古家あり',
  '低層マンション': '低層マンション',
  '一棟レジデンス': '一棟レジデンス',
  '一棟ビル': '一棟ビル',
  '空き地': '空き地',
  'ロードサイド付き使用地': 'ロードサイド付き使用地',
  '中古マンション': '中古マンション',
};

const folderCache = new Map<string, string>();

export async function getOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const cacheKey = `${parentId ?? 'root'}::${name}`;
  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  const drive = getDriveClient();
  let query = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const listRes = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const existing = listRes.data.files?.[0];
  if (existing?.id) {
    folderCache.set(cacheKey, existing.id);
    return existing.id;
  }

  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });

  const folderId = createRes.data.id!;
  logger.info(`Driveフォルダ作成: ${name} (${folderId})`);
  folderCache.set(cacheKey, folderId);
  return folderId;
}

export async function getPropertyFolder(
  propertyType: string,
  caseId: string
): Promise<{ id: string; url: string }> {
  const rootFolderId = ENV.DRIVE_ROOT_FOLDER_ID;
  const typeFolderName = TYPE_FOLDER_NAMES[propertyType] || 'その他';

  const typeFolderId = await getOrCreateFolder(typeFolderName, rootFolderId);
  const propertyFolderId = await getOrCreateFolder(caseId, typeFolderId);

  const url = `https://drive.google.com/drive/folders/${propertyFolderId}`;
  return { id: propertyFolderId, url };
}

export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<{ id: string; url: string }> {
  const drive = getDriveClient();
  const stream = Readable.from(fileBuffer);

  const uploadRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, webViewLink',
  });

  const fileId = uploadRes.data.id!;
  const url = await createWebViewLink(fileId);

  logger.info(`ファイルアップロード: ${fileName} → ${folderId}`);
  return { id: fileId, url };
}

export async function createWebViewLink(fileId: string): Promise<string> {
  const drive = getDriveClient();
  // Only share publicly if explicitly enabled (default: off for data privacy)
  if (process.env.DRIVE_PUBLIC_SHARE === 'true') {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
      });
    } catch (e: any) {
      logger.warn(`権限設定スキップ: ${fileId} (${e.message})`);
    }
  }

  const fileRes = await drive.files.get({
    fileId,
    fields: 'webViewLink',
  });

  return fileRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}

export async function uploadPropertyDocument(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  propertyType: string,
  caseId: string
): Promise<{ folderId: string; folderUrl: string; fileId: string; fileUrl: string }> {
  const folder = await getPropertyFolder(propertyType, caseId);
  const file = await uploadFile(fileBuffer, fileName, mimeType, folder.id);

  logger.info(`物件資料アップロード完了: ${caseId}/${fileName}`);
  return {
    folderId: folder.id,
    folderUrl: folder.url,
    fileId: file.id,
    fileUrl: file.url,
  };
}

export async function setupRootFolderStructure(): Promise<void> {
  const rootFolderId = ENV.DRIVE_ROOT_FOLDER_ID;

  const subFolders = [
    ...Object.values(TYPE_FOLDER_NAMES),
    '物件概要書',
    '物件資料',
  ];

  for (const name of subFolders) {
    await getOrCreateFolder(name, rootFolderId);
    logger.info(`フォルダ確認/作成: ${name}`);
  }

  logger.info('Driveフォルダ構造セットアップ完了');
}
