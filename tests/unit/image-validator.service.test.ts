import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateProfilePicture, validateGalleryImage, rekognition } from '@/services/image-validator.service';
import { DetectFacesCommand, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';

describe('ImageValidatorService', () => {
  const dummyBuffer = Buffer.from('test-image-content');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateProfilePicture', () => {
    it('should reject image if moderation labels are detected', async () => {
      vi.spyOn(rekognition, 'send').mockImplementation(async (command: any) => {
        if (command instanceof DetectModerationLabelsCommand) {
          return { ModerationLabels: [{ Name: 'Explicit Nudity', Confidence: 99 }] };
        }
        return {};
      });

      const result = await validateProfilePicture(dummyBuffer);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Adult or inappropriate content detected');
    });

    it('should reject image if no faces are detected', async () => {
      vi.spyOn(rekognition, 'send').mockImplementation(async (command: any) => {
        if (command instanceof DetectModerationLabelsCommand) {
          return { ModerationLabels: [] };
        }
        if (command instanceof DetectFacesCommand) {
          return { FaceDetails: [] };
        }
        return {};
      });

      const result = await validateProfilePicture(dummyBuffer);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('No human face detected');
    });

    it('should reject image if multiple faces are detected', async () => {
      vi.spyOn(rekognition, 'send').mockImplementation(async (command: any) => {
        if (command instanceof DetectModerationLabelsCommand) {
          return { ModerationLabels: [] };
        }
        if (command instanceof DetectFacesCommand) {
          return { FaceDetails: [{}, {}] };
        }
        return {};
      });

      const result = await validateProfilePicture(dummyBuffer);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Multiple faces detected');
    });

    it('should approve image if exactly one face is detected and no moderation labels', async () => {
      vi.spyOn(rekognition, 'send').mockImplementation(async (command: any) => {
        if (command instanceof DetectModerationLabelsCommand) {
          return { ModerationLabels: [] };
        }
        if (command instanceof DetectFacesCommand) {
          return { FaceDetails: [{ Confidence: 99.5 }] };
        }
        return {};
      });

      const result = await validateProfilePicture(dummyBuffer);
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Image approved.');
    });
  });

  describe('validateGalleryImage', () => {
    it('should reject gallery image if moderation labels are detected', async () => {
      vi.spyOn(rekognition, 'send').mockImplementation(async (command: any) => {
        if (command instanceof DetectModerationLabelsCommand) {
          return { ModerationLabels: [{ Name: 'Suggestive', Confidence: 95 }] };
        }
        return {};
      });

      const result = await validateGalleryImage(dummyBuffer);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Adult or inappropriate content detected in gallery photo');
    });

    it('should approve gallery image if no moderation labels detected', async () => {
      vi.spyOn(rekognition, 'send').mockImplementation(async (command: any) => {
        if (command instanceof DetectModerationLabelsCommand) {
          return { ModerationLabels: [] };
        }
        return {};
      });

      const result = await validateGalleryImage(dummyBuffer);
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Gallery image approved.');
    });
  });
});
