import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';
import fs from 'fs';
import { env } from './env';
import { logger } from '../utils/logger';

let firebaseInitialized = false;

try {
  let credentialData: any;

  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      credentialData = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      logger.info('Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT env variable');
    } catch (e) {
      logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON env variable', e);
    }
  } else if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    if (fs.existsSync(env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
      try {
        const fileContent = fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8');
        credentialData = JSON.parse(fileContent);
        logger.info(`Firebase Admin initialized from file: ${env.FIREBASE_SERVICE_ACCOUNT_PATH}`);
      } catch (e) {
        logger.error(`Failed to read/parse Firebase service account file at ${env.FIREBASE_SERVICE_ACCOUNT_PATH}`, e);
      }
    } else {
      logger.warn(`Firebase service account file not found at ${env.FIREBASE_SERVICE_ACCOUNT_PATH}`);
    }
  } else if (fs.existsSync('firebase-service-account.json')) {
    try {
      const fileContent = fs.readFileSync('firebase-service-account.json', 'utf8');
      credentialData = JSON.parse(fileContent);
      logger.info('Firebase Admin initialized from default firebase-service-account.json');
    } catch (e) {
      logger.error('Failed to read/parse default firebase-service-account.json', e);
    }
  }

  if (credentialData) {
    initializeApp({
      credential: cert(credentialData),
    });
    firebaseInitialized = true;
  } else {
    logger.warn('Firebase Service Account credentials not provided. Running in FCM simulation/fallback mode.');
  }
} catch (error) {
  logger.error('Error during Firebase Admin initialization:', error);
}

/**
 * Send push notification to a device token.
 */
export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (!fcmToken) {
    logger.warn('sendPushNotification called but fcmToken is empty');
    return;
  }

  if (!firebaseInitialized) {
    logger.info(`[FCM Simulation Mode] Sending notification to token "${fcmToken}":
Title: "${title}"
Body: "${body}"
Data: ${JSON.stringify(data || {})}`);
    return;
  }

  try {
    const message: Message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data,
    };

    const response = await getMessaging().send(message);
    logger.info(`Successfully sent FCM message: ${response}`);
  } catch (error) {
    logger.error(`Error sending FCM message to token ${fcmToken}:`, error);
  }
}
