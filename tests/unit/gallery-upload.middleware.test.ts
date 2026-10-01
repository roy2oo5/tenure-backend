import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';

import { galleryUploadFields, MAX_GALLERY_PHOTO_BYTES } from '@/middlewares/upload.middleware';
import { AppError } from '@/utils/app-error';

describe('gallery upload size limit', () => {
  const app = express();
  app.post('/gallery', galleryUploadFields([{ name: 'galleryPhoto', maxCount: 1 }]), (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]>;
    res.status(200).json({ size: files.galleryPhoto[0].size });
  });
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status((error as AppError).statusCode ?? 500).json({ message: error.message });
  });

  it('accepts a gallery photo that is exactly 5 MB', async () => {
    const response = await request(app)
      .post('/gallery')
      .attach('galleryPhoto', Buffer.alloc(MAX_GALLERY_PHOTO_BYTES), {
        filename: 'gallery.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(200);
    expect(response.body.size).toBe(MAX_GALLERY_PHOTO_BYTES);
  });

  it('rejects a gallery photo larger than 5 MB with a clear message', async () => {
    const response = await request(app)
      .post('/gallery')
      .attach('galleryPhoto', Buffer.alloc(MAX_GALLERY_PHOTO_BYTES + 1), {
        filename: 'gallery.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(413);
    expect(response.body.message).toBe('Each gallery photo must be 5 MB or smaller.');
  });
});
