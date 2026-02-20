import { del, put } from '@vercel/blob';
import { Attachment, EntrySheet, ProductEntry } from './types.js';

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
]);

const ATTACHMENT_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const safeFileName = (name: string): string =>
  name.replace(/[^\w.\-]/g, '_').slice(0, 120) || 'file';

const configuredAllowedHosts = (process.env.MEDIA_ALLOWED_HOSTS || '')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

const isAllowedHost = (host: string): boolean => {
  const normalized = host.toLowerCase();
  if (normalized.endsWith('.public.blob.vercel-storage.com')) return true;
  if (normalized === 'blob.vercel-storage.com') return true;
  return configuredAllowedHosts.includes(normalized);
};

const isAllowedHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    return isHttp && isAllowedHost(parsed.hostname);
  } catch {
    return false;
  }
};

const parseDataUrl = (value: string): { mimeType: string; bytes: Uint8Array } => {
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('Invalid data URL');
  }
  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');
  return { mimeType, bytes: new Uint8Array(buffer) };
};

const ensureAllowedMime = (mimeType: string, isAttachment: boolean): void => {
  const allowed = isAttachment ? ATTACHMENT_MIME_TYPES : IMAGE_MIME_TYPES;
  if (!allowed.has(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
};

const ensureAllowedSize = (size: number, isAttachment: boolean): void => {
  const max = isAttachment ? MAX_ATTACHMENT_BYTES : MAX_IMAGE_BYTES;
  if (!Number.isFinite(size) || size <= 0 || size > max) {
    throw new Error(
      `File size must be between 1 byte and ${Math.floor(max / (1024 * 1024))}MB`
    );
  }
};

const uploadBinary = async (
  bytes: Uint8Array,
  mimeType: string,
  pathPrefix: string,
  fileName: string
): Promise<string> => {
  const blob = await put(`${pathPrefix}/${Date.now()}-${safeFileName(fileName)}`, bytes, {
    access: 'public',
    contentType: mimeType,
    addRandomSuffix: true,
  });
  return blob.url;
};

export const mediaLimits = {
  maxImageBytes: MAX_IMAGE_BYTES,
  maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
};

const isManagedBlobUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    return isHttp && isAllowedHost(parsed.hostname);
  } catch {
    return false;
  }
};

const normalizeMediaUrl = async (
  value: string | undefined,
  pathPrefix: string,
  fileName: string,
  isAttachment: boolean
): Promise<string | undefined> => {
  if (!value) return undefined;
  if (value.startsWith('data:')) {
    const { mimeType, bytes } = parseDataUrl(value);
    ensureAllowedMime(mimeType, isAttachment);
    ensureAllowedSize(bytes.byteLength, isAttachment);
    return uploadBinary(bytes, mimeType, pathPrefix, fileName);
  }

  if (!isAllowedHttpUrl(value)) {
    throw new Error('Only allowed Blob URLs are accepted');
  }
  return value;
};

const normalizeAttachment = async (
  attachment: Attachment,
  pathPrefix: string
): Promise<Attachment> => {
  const sourceUrl = attachment.url || attachment.dataUrl;
  const normalizedUrl = await normalizeMediaUrl(
    sourceUrl,
    pathPrefix,
    attachment.name || 'attachment',
    true
  );
  if (!normalizedUrl) {
    throw new Error('Attachment URL is required');
  }
  return {
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
    url: normalizedUrl,
  };
};

const normalizeProduct = async (
  product: ProductEntry,
  pathPrefix: string
): Promise<ProductEntry> => {
  const normalizedProductImage = await normalizeMediaUrl(
    product.productImage,
    `${pathPrefix}/product-image`,
    `${product.id}-product`,
    false
  );
  const normalizedPromoImage = await normalizeMediaUrl(
    product.promoImage,
    `${pathPrefix}/promo-image`,
    `${product.id}-promo`,
    false
  );
  const normalizedAttachments = product.productAttachments
    ? await Promise.all(
        product.productAttachments.map((attachment, index) =>
          normalizeAttachment(attachment, `${pathPrefix}/product-attachments/${product.id}/${index}`)
        )
      )
    : undefined;

  return {
    ...product,
    productImage: normalizedProductImage,
    promoImage: normalizedPromoImage,
    productAttachments: normalizedAttachments,
  };
};

export const normalizeSheetMedia = async (
  sheet: EntrySheet,
  pathPrefix: string
): Promise<EntrySheet> => {
  const normalizedProducts = await Promise.all(
    sheet.products.map((product) => normalizeProduct(product, `${pathPrefix}/products`))
  );
  const normalizedAttachments = sheet.attachments
    ? await Promise.all(
        sheet.attachments.map((attachment, index) =>
          normalizeAttachment(attachment, `${pathPrefix}/sheet-attachments/${index}`)
        )
      )
    : undefined;

  return {
    ...sheet,
    products: normalizedProducts,
    attachments: normalizedAttachments,
  };
};

export const uploadMediaDataUrl = async (
  dataUrl: string,
  fileName: string,
  pathPrefix: string,
  isAttachment: boolean
): Promise<string> => {
  const { mimeType, bytes } = parseDataUrl(dataUrl);
  ensureAllowedMime(mimeType, isAttachment);
  ensureAllowedSize(bytes.byteLength, isAttachment);
  return uploadBinary(bytes, mimeType, pathPrefix, fileName);
};

export const migrateStoreMedia = async (sheets: EntrySheet[]): Promise<EntrySheet[]> => {
  const migrated: EntrySheet[] = [];
  for (const sheet of sheets) {
    const migratedSheet = await normalizeSheetMedia(sheet, `pharmapop/migration/${sheet.id}`);
    migrated.push(migratedSheet);
  }
  return migrated;
};

const hasLegacyAttachment = (attachment: Attachment): boolean =>
  Boolean(attachment.dataUrl) || Boolean(attachment.url?.startsWith('data:'));

const collectAttachmentUrls = (attachments?: Attachment[]): string[] =>
  (attachments || [])
    .map((attachment) => attachment.url || attachment.dataUrl)
    .filter((value): value is string => Boolean(value));

const collectSheetMediaUrls = (sheet: EntrySheet): string[] => {
  const urls: string[] = [];
  urls.push(...collectAttachmentUrls(sheet.attachments));
  for (const product of sheet.products) {
    if (product.productImage) urls.push(product.productImage);
    if (product.promoImage) urls.push(product.promoImage);
    urls.push(...collectAttachmentUrls(product.productAttachments));
  }
  return urls;
};

const collectStoreMediaUrlSet = (sheets: EntrySheet[]): Set<string> => {
  const urls = new Set<string>();
  for (const sheet of sheets) {
    for (const url of collectSheetMediaUrls(sheet)) {
      urls.add(url);
    }
  }
  return urls;
};

export const deleteUnusedManagedBlobUrls = async (
  beforeSheets: EntrySheet[],
  afterSheets: EntrySheet[]
): Promise<void> => {
  const beforeSet = collectStoreMediaUrlSet(beforeSheets);
  const afterSet = collectStoreMediaUrlSet(afterSheets);
  const toDelete: string[] = [];

  for (const url of beforeSet) {
    if (!afterSet.has(url) && isManagedBlobUrl(url)) {
      toDelete.push(url);
    }
  }

  for (const url of toDelete) {
    try {
      await del(url);
    } catch (error) {
      console.warn('Failed to delete blob URL:', url, error);
    }
  }
};

export const hasLegacyEmbeddedMedia = (sheets: EntrySheet[]): boolean =>
  sheets.some((sheet) => {
    if (sheet.attachments?.some(hasLegacyAttachment)) return true;
    return sheet.products.some((product) => {
      if (product.productImage?.startsWith('data:')) return true;
      if (product.promoImage?.startsWith('data:')) return true;
      return Boolean(product.productAttachments?.some(hasLegacyAttachment));
    });
  });
