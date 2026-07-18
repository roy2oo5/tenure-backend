import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadService } from '@/services/upload.service';
import fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// Mock S3 Client
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => {
      return {
        send: mockSend,
      };
    }),
    PutObjectCommand: vi.fn().mockImplementation((args) => args),
  };
});

describe('UploadService', () => {
  const mockFile = {
    fieldname: 'file',
    originalname: 'test-image.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from('fake-image-bytes'),
    size: 16,
  } as Express.Multer.File;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_ACCESS_KEY_ID = 'placeholder';
    process.env.AWS_SECRET_ACCESS_KEY = 'placeholder';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_S3_BUCKET = 'placeholder';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('uploadFile local fallback', () => {
    it('should save file locally when S3 keys are placeholders', async () => {
      // Mock local environment
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'placeholder');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'placeholder');
      vi.stubEnv('AWS_S3_BUCKET', 'placeholder');

      vi.mocked(fs.existsSync).mockReturnValue(false);
      const mkdirSyncMock = vi.mocked(fs.mkdirSync);
      const writeFileSyncMock = vi.mocked(fs.writeFileSync);

      const url = await UploadService.uploadFile(mockFile, 'uploads', 'localhost:5000', 'http');

      expect(url).toContain('http://localhost:5000/uploads/');
      expect(url).toContain('.png');
      expect(mkdirSyncMock).toHaveBeenCalled();
      expect(writeFileSyncMock).toHaveBeenCalled();
    });

    it('should save file locally with relative URL if host is not provided', async () => {
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'placeholder');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'placeholder');
      vi.stubEnv('AWS_S3_BUCKET', 'placeholder');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      const writeFileSyncMock = vi.mocked(fs.writeFileSync);

      const url = await UploadService.uploadFile(mockFile, 'uploads');

      expect(url).toContain('/uploads/');
      expect(url).toContain('.png');
      expect(writeFileSyncMock).toHaveBeenCalled();
    });
  });
});
