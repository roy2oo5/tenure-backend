import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { AppError } from '../utils/app-error';

// Check if S3 credentials are set and are not placeholder
const hasS3Config =
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_ACCESS_KEY_ID !== 'placeholder' &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_SECRET_ACCESS_KEY !== 'placeholder' &&
  process.env.AWS_S3_BUCKET &&
  process.env.AWS_S3_BUCKET !== 'placeholder';

let s3Client: S3Client | null = null;

if (hasS3Config) {
  try {
    s3Client = new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION || 'us-east-1',
    });
    logger.info('☁️ AWS S3 client initialized successfully.');
  } catch (error: any) {
    logger.error(`Failed to initialize AWS S3 client: ${error.message}`);
  }
} else {
  logger.info(
    '📁 AWS S3 configuration not found or is using placeholder. Falling back to local storage.',
  );
}

export class UploadService {
  public static async listAvatars(reqHost?: string, reqProtocol?: string): Promise<string[]> {
    if (!s3Client || !process.env.AWS_S3_BUCKET) {
      throw new AppError('Avatar library is unavailable', 503);
    }

    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.AWS_S3_BUCKET,
        Prefix: 'avatars/',
        MaxKeys: 100,
      }),
    );
    const avatars = (response.Contents ?? [])
      .filter(
        (item): item is typeof item & { Key: string } =>
          Boolean(item.Key) && UploadService.isImageKey(item.Key!),
      )
      .sort((a, b) => a.Key.localeCompare(b.Key));

    return avatars.map((item) => {
      const key = item.Key;
      const path = `/api/upload/media/${encodeURIComponent(key)}`;
      const version = item.ETag?.replaceAll('"', '') ?? item.LastModified?.getTime().toString();
      const versionedPath = version ? `${path}?v=${encodeURIComponent(version)}` : path;
      return reqHost && reqProtocol
        ? `${reqProtocol}://${reqHost}${versionedPath}`
        : versionedPath;
    });
  }

  /**
   * Upload a file to AWS S3 (or fallback to local disk)
   * Returns the public URL of the uploaded file
   */
  public static async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads',
    reqHost?: string,
    reqProtocol?: string,
  ): Promise<string> {
    if (!file.buffer?.length) {
      throw new AppError('The uploaded file is empty', 400);
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname) || '.jpg';
    const fileName = `${folder}/${uniqueSuffix}${fileExtension}`;

    // 1. Attempt S3 Upload if client exists
    if (s3Client && process.env.AWS_S3_BUCKET) {
      const bucketName = process.env.AWS_S3_BUCKET;

      try {
        // Try uploading with public-read ACL first
        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: bucketName,
              Key: fileName,
              Body: file.buffer,
              ContentType: file.mimetype,
              ACL: 'public-read',
            }),
          );
        } catch (aclError: any) {
          logger.warn(
            `S3 upload with ACL failed: ${aclError.message}. Retrying without ACL (modern S3 configuration)...`,
          );
          // Retry without ACL in case S3 bucket policy enforces BucketOwnerEnforced or ACL is disabled
          await s3Client.send(
            new PutObjectCommand({
              Bucket: bucketName,
              Key: fileName,
              Body: file.buffer,
              ContentType: file.mimetype,
            }),
          );
        }

        logger.info(`Successfully uploaded ${fileName} to AWS S3`);
        if (reqHost && reqProtocol) {
          return `${reqProtocol}://${reqHost}/api/upload/media/${encodeURIComponent(fileName)}`;
        }
        return `/api/upload/media/${encodeURIComponent(fileName)}`;
      } catch (error: any) {
        logger.error(
          `S3 upload failed completely: ${error.message}. Falling back to local storage.`,
        );
        if (process.env.NODE_ENV === 'production' && file.mimetype.startsWith('audio/')) {
          throw new AppError('Voice message storage is temporarily unavailable', 503);
        }
      }
    }

    if (process.env.NODE_ENV === 'production' && file.mimetype.startsWith('audio/')) {
      throw new AppError('Voice message storage is not configured', 503);
    }

    // 2. Local Fallback Storage
    try {
      const localDir = path.join(__dirname, '../../public/uploads');

      // Ensure directory exists
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      const localFileName = `${uniqueSuffix}${fileExtension}`;
      const localFilePath = path.join(localDir, localFileName);

      fs.writeFileSync(localFilePath, file.buffer);
      logger.info(`Successfully saved file locally to ${localFilePath}`);

      // Build absolute URL if HTTP host and protocol details are supplied
      if (reqHost && reqProtocol) {
        return `${reqProtocol}://${reqHost}/uploads/${localFileName}`;
      }

      // Fallback relative URL
      return `/uploads/${localFileName}`;
    } catch (localError: any) {
      logger.error(`Local fallback file saving failed: ${localError.message}`);
      throw localError;
    }
  }

  public static async getFile(rawKey: string): Promise<{ stream: Readable; contentType: string }> {
    const key = UploadService.normalizeUploadedKey(rawKey);

    if (s3Client && process.env.AWS_S3_BUCKET) {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
        }),
      );
      if (!response.Body || !(response.Body instanceof Readable)) {
        throw new AppError('Uploaded file not found', 404);
      }
      return {
        stream: response.Body,
        contentType: response.ContentType ?? UploadService.contentTypeForKey(key),
      };
    }

    const basename = path.basename(key);
    const localFilePath = path.join(__dirname, '../../public/uploads', basename);
    if (!fs.existsSync(localFilePath)) {
      throw new AppError('Uploaded file not found', 404);
    }
    return {
      stream: fs.createReadStream(localFilePath),
      contentType: UploadService.contentTypeForKey(key),
    };
  }

  public static async deleteUploadedFile(mediaUrl: string): Promise<void> {
    const parsed = new URL(mediaUrl, 'http://localhost');
    const mediaPrefix = '/api/upload/media/';
    if (parsed.pathname.startsWith(mediaPrefix)) {
      const key = UploadService.normalizeUploadedKey(parsed.pathname.slice(mediaPrefix.length));
      if (!s3Client || !process.env.AWS_S3_BUCKET) {
        throw new AppError('Voice message storage is unavailable', 503);
      }
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }),
      );
      return;
    }

    const localPrefix = '/uploads/';
    if (parsed.pathname.startsWith(localPrefix)) {
      const localFilePath = path.join(
        __dirname,
        '../../public/uploads',
        path.basename(parsed.pathname),
      );
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    }
  }

  private static normalizeUploadedKey(rawKey: string): string {
    const decoded = decodeURIComponent(rawKey).replace(/\\/g, '/');
    const normalized = path.posix.normalize(decoded);
    if (
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      !['avatars/', 'gallery/', 'profiles/', 'uploads/', 'users/'].some((prefix) =>
        normalized.startsWith(prefix),
      )
    ) {
      throw new AppError('Invalid uploaded file path', 400);
    }
    return normalized;
  }

  private static contentTypeForKey(key: string): string {
    const lower = key.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.aac')) return 'audio/aac';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.webm')) return 'audio/webm';
    return 'image/jpeg';
  }

  private static isImageKey(key: string): boolean {
    return /\.(avif|gif|jpe?g|png|webp)$/i.test(key);
  }
}
