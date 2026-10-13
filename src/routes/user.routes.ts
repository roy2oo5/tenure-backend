import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { ProfileController } from '../controllers/profile.controller';
import { DiscoverController } from '../controllers/discover.controller';
import { BlockController } from '../controllers/block.controller';
import { MuteController } from '../controllers/mute.controller';
import { validate } from '../middlewares/validation.middleware';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
  registerSchema,
  loginSchema,
  updateUserSchema,
  refreshSessionSchema,
  phoneAuthSchema,
} from '../validations/user.validation';
import {
  createProfileSchema,
  storeAadhaarImageDetailsSchema,
} from '../validations/profile.validation';
import {
  discoverSearchSchema,
  mateProfileParamsSchema,
  savedMateParamsSchema,
} from '../validations/discover.validation';
import { Role } from '@prisma/client';
import {
  aadhaarCredentialUploadMiddleware,
  aadhaarQrImageUploadMiddleware,
} from '../middlewares/upload.middleware';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "d0d618d3-7d2d-45ff-85f2-4ff5d9e52504"
 *         email:
 *           type: string
 *           format: email
 *           example: "jane.doe@example.com"
 *         name:
 *           type: string
 *           example: "Jane Doe"
 *         phone:
 *           type: string
 *           example: "9876543210"
 *         role:
 *           type: string
 *           enum: [USER, ADMIN]
 *           example: "USER"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-06-09T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-06-09T10:05:00.000Z"
 *     AuthResponse:
 *       type: object
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/User'
 *         token:
 *           type: string
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     Profile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "b2d518d3-7d2d-45ff-85f2-4ff5d9e52504"
 *         userId:
 *           type: string
 *           format: uuid
 *           example: "d0d618d3-7d2d-45ff-85f2-4ff5d9e52504"
 *         profilePhoto:
 *           type: string
 *           format: url
 *           example: "https://example.com/avatar.jpg"
 *         fullName:
 *           type: string
 *           example: "Jane Doe"
 *         dob:
 *           type: string
 *           format: date-time
 *           example: "1995-12-15T00:00:00.000Z"
 *         gender:
 *           type: string
 *           example: "female"
 *         country:
 *           type: string
 *           example: "India"
 *         state:
 *           type: string
 *           example: "Karnataka"
 *         district:
 *           type: string
 *           example: "Bangalore"
 *         pinCode:
 *           type: string
 *           example: "560001"
 *         languages:
 *           type: array
 *           items:
 *             type: string
 *           example: ["English", "Hindi"]
 *         categories:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Travel Mate", "Food Mate"]
 *         hourlyRate:
 *           type: number
 *           format: float
 *           example: 25.5
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-06-09T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-06-09T10:05:00.000Z"
 */

/**
 * @swagger
 * /users/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "jane.doe@example.com"
 *               password:
 *                 type: string
 *                 minimum: 8
 *                 example: "securePassword123"
 *               name:
 *                 type: string
 *                 example: "Jane Doe"
 *               role:
 *                 type: string
 *                 enum: [USER, ADMIN]
 *                 example: "USER"
 *     responses:
 *       201:
 *         description: Successfully registered. Returns user details and JWT auth token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error or invalid inputs.
 *       409:
 *         description: Email is already registered.
 */
router.post('/register', validate(registerSchema), UserController.register);

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: Log in an existing user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "jane.doe@example.com"
 *               password:
 *                 type: string
 *                 example: "securePassword123"
 *     responses:
 *       200:
 *         description: Successfully logged in. Returns user details and JWT auth token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Incorrect email or password.
 */
router.post('/login', validate(loginSchema), UserController.login);

/**
 * @swagger
 * /users/phone-auth:
 *   post:
 *     summary: Log in or register using a phone number
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *               accessToken:
 *                 type: string
 *                 description: Optional access token returned by MSG91 after OTP verification.
 *               reqId:
 *                 type: string
 *                 description: MSG91 request id returned when OTP was sent.
 *               otp:
 *                 type: string
 *                 description: OTP entered by the user. Required with reqId when accessToken is not supplied.
 *     responses:
 *       200:
 *         description: Existing user logged in or new user created. Returns user and JWT.
 *       400:
 *         description: Invalid phone number.
 */
router.post('/phone-auth', validate(phoneAuthSchema), UserController.phoneAuth);
router.post('/refresh-session', validate(refreshSessionSchema), UserController.refreshSession);
router.get('/phone-login-status', UserController.phoneLoginStatus);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get profile details of the logged-in user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile details retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Not logged in or invalid token.
 */
router.get('/me', protect, UserController.getMe);
router.post('/logout', protect, UserController.logout);
router.get('/active-session', protect, UserController.getActiveSession);

/**
 * @swagger
 * /users/update-me:
 *   patch:
 *     summary: Update profile of the logged-in user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "new.email@example.com"
 *               name:
 *                 type: string
 *                 example: "Jane Smith"
 *     responses:
 *       200:
 *         description: User profile successfully updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Not authenticated.
 */
router.patch('/update-me', protect, validate(updateUserSchema), UserController.updateMe);
router.patch('/deactivate-me', protect, UserController.deactivateMe);
router.delete('/delete-me', protect, UserController.deleteMe);
router.patch('/change-password', protect, UserController.changePassword);
router.post('/block', protect, BlockController.block);
router.post('/unblock', protect, BlockController.unblock);
router.get('/blocked', protect, BlockController.getBlocked);
router.post('/mute', protect, MuteController.mute);
router.post('/unmute', protect, MuteController.unmute);
router.get('/muted', protect, MuteController.list);

/**
 * @swagger
 * /users/profile:
 *   post:
 *     summary: Create or update the current user's profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - dob
 *               - gender
 *               - country
 *               - state
 *               - district
 *               - pinCode
 *               - languages
 *               - categories
 *               - hourlyRate
 *             properties:
 *               profilePhoto:
 *                 type: string
 *                 format: url
 *                 example: "https://example.com/avatar.jpg"
 *               fullName:
 *                 type: string
 *                 example: "Jane Doe"
 *               dob:
 *                 type: string
 *                 format: date
 *                 example: "1995-12-15"
 *               gender:
 *                 type: string
 *                 example: "female"
 *               country:
 *                 type: string
 *                 example: "India"
 *               state:
 *                 type: string
 *                 example: "Karnataka"
 *               district:
 *                 type: string
 *                 example: "Bangalore"
 *               pinCode:
 *                 type: string
 *                 example: "560001"
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["English", "Hindi"]
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Travel Mate", "Food Mate"]
 *               hourlyRate:
 *                 type: number
 *                 format: float
 *                 example: 25.5
 *     responses:
 *       200:
 *         description: Profile successfully created or updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     profile:
 *                       $ref: '#/components/schemas/Profile'
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Not authenticated.
 *
 *   get:
 *     summary: Get the current user's profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     profile:
 *                       $ref: '#/components/schemas/Profile'
 *       401:
 *         description: Not authenticated.
 *       404:
 *         description: Profile not found.
 */
router.post('/profile', protect, validate(createProfileSchema), ProfileController.upsertMyProfile);
router.get('/profile', protect, ProfileController.getMyProfile);
router.patch('/profile/location', protect, ProfileController.updateLocation);
router.patch('/profile/ready-now', protect, ProfileController.updateReadyNow);
router.get('/saved-addresses', protect, ProfileController.getSavedAddresses);
router.post('/saved-addresses', protect, ProfileController.saveAddress);
router.patch(
  '/saved-addresses/selection/clear',
  protect,
  ProfileController.clearSelectedAddress,
);
router.patch(
  '/saved-addresses/:addressId/select',
  protect,
  ProfileController.selectSavedAddress,
);
router.delete(
  '/saved-addresses/:addressId',
  protect,
  ProfileController.deleteSavedAddress,
);
router.post(
  '/profile/aadhaar-qr-verification',
  protect,
  aadhaarQrImageUploadMiddleware.single('qrImage'),
  ProfileController.verifyAadhaarQR,
);
router.post(
  '/profile/aadhaar-image-details',
  protect,
  validate(storeAadhaarImageDetailsSchema),
  ProfileController.storeAadhaarImageDetails,
);
router.post(
  '/profile/aadhaar-shared-credential',
  protect,
  aadhaarCredentialUploadMiddleware.fields([
    { name: 'credential', maxCount: 1 },
    { name: 'CREDENTIAL', maxCount: 1 },
  ]),
  ProfileController.verifySharedAadhaarCredential,
);
router.patch(
  '/profile/aadhaar-name',
  protect,
  ProfileController.useVerifiedAadhaarName,
);

router.get('/discover', protect, validate(discoverSearchSchema), DiscoverController.search);
router.get(
  '/discover/instants',
  protect,
  validate(discoverSearchSchema),
  DiscoverController.instants,
);
router.get('/saved-mates', protect, validate(discoverSearchSchema), DiscoverController.saved);
router.post(
  '/saved-mates/:mateUserId',
  protect,
  validate(savedMateParamsSchema),
  DiscoverController.saveMate,
);
router.delete(
  '/saved-mates/:mateUserId',
  protect,
  validate(savedMateParamsSchema),
  DiscoverController.unsaveMate,
);
router.get(
  '/mates/:userId',
  protect,
  validate(mateProfileParamsSchema),
  DiscoverController.getMateProfile,
);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Retrieve list of all users (Admin Only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 results:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated.
 *       403:
 *         description: Unauthorized (Not an ADMIN).
 */
router.get('/', protect, restrictTo(Role.ADMIN), UserController.getAll);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user by ID (Admin Only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique UUID of the user to delete.
 *     responses:
 *       204:
 *         description: User successfully deleted (No Content).
 *       401:
 *         description: Not authenticated.
 *       403:
 *         description: Unauthorized (Not an ADMIN).
 *       404:
 *         description: User not found.
 */
router.delete('/:id', protect, restrictTo(Role.ADMIN), UserController.deleteUser);

export default router;
