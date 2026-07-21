import { GetObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
      }
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

  private static normalizeUploadedKey(rawKey: string): string {
    const decoded = decodeURIComponent(rawKey).replace(/\\/g, '/');
    const normalized = path.posix.normalize(decoded);
    if (
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      !['gallery/', 'profiles/', 'uploads/'].some((prefix) => normalized.startsWith(prefix))
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
    return 'image/jpeg';
  }
}
