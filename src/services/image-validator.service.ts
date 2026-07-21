import {
  RekognitionClient,
  DetectFacesCommand,
  DetectModerationLabelsCommand,
  DetectFacesCommandInput,
  DetectModerationLabelsCommandInput,
} from "@aws-sdk/client-rekognition";
import { logger } from "../utils/logger";

const region = process.env.AWS_REGION || "ap-south-1";

// Initialize the Rekognition client. Uses env credentials if available, or EC2/ECS IAM Role credentials automatically.
const clientConfig: any = { region };
if (
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_ACCESS_KEY_ID !== "placeholder" &&
  process.env.AWS_SECRET_ACCESS_KEY !== "placeholder"
) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

export const rekognition = new RekognitionClient(clientConfig);

export interface ValidationResult {
  valid: boolean;
  message: string;
}

/**
 * Validates a profile picture for face presence and adult content.
 * Requires exactly one human face and no explicit/adult content.
 * @param imageBuffer - The image file buffer from Multer
 */
export async function validateProfilePicture(imageBuffer: Buffer): Promise<ValidationResult> {
  try {
    const params = {
      Image: {
        Bytes: imageBuffer,
      },
    };

    // 1. Check for Explicit / Adult Content
    const moderationParams: DetectModerationLabelsCommandInput = params;
    const moderationCommand = new DetectModerationLabelsCommand(moderationParams);
    const moderationResult = await rekognition.send(moderationCommand);

    if (moderationResult.ModerationLabels && moderationResult.ModerationLabels.length > 0) {
      return {
        valid: false,
        message: "Image rejected: Adult or inappropriate content detected.",
      };
    }

    // 2. Check for Face Presence
    const faceParams: DetectFacesCommandInput = params;
    const faceCommand = new DetectFacesCommand(faceParams);
    const faceResult = await rekognition.send(faceCommand);

    if (!faceResult.FaceDetails || faceResult.FaceDetails.length === 0) {
      return {
        valid: false,
        message: "Image rejected: No human face detected. Please upload a clear photo of your face.",
      };
    }

    if (faceResult.FaceDetails.length > 1) {
      return {
        valid: false,
        message: "Image rejected: Multiple faces detected. Profile picture must contain only one face.",
      };
    }

    // Image passed all checks
    return {
      valid: true,
      message: "Image approved.",
    };
  } catch (error: any) {
    logger.error("Error validating profile picture with AWS Rekognition:", error);
    throw new Error("Image validation failed due to an internal server error.");
  }
}

/**
 * Validates a live gallery photo for explicit/adult content.
 * @param imageBuffer - The image file buffer from Multer
 */
export async function validateGalleryImage(imageBuffer: Buffer): Promise<ValidationResult> {
  try {
    const params = {
      Image: {
        Bytes: imageBuffer,
      },
    };

    // 1. Check for Explicit / Adult Content
    const moderationParams: DetectModerationLabelsCommandInput = params;
    const moderationCommand = new DetectModerationLabelsCommand(moderationParams);
    const moderationResult = await rekognition.send(moderationCommand);

    if (moderationResult.ModerationLabels && moderationResult.ModerationLabels.length > 0) {
      return {
        valid: false,
        message: "Image rejected: Adult or inappropriate content detected in gallery photo.",
      };
    }

    // Live gallery image passed content moderation check
    return {
      valid: true,
      message: "Gallery image approved.",
    };
  } catch (error: any) {
    logger.error("Error validating gallery image with AWS Rekognition:", error);
    throw new Error("Gallery image validation failed due to an internal server error.");
  }
}
