import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import crypto from 'crypto';
import {
  decompressQrPayload,
  parseAadhaarBuffer,
  verifyAadhaarSignature,
  processAadhaarSecureQR,
  matchAadhaarDemographics,
  AadhaarDemographics,
} from '../../src/utils/aadhaar-qr';

describe('Aadhaar Secure QR Code Utility Module', () => {
  // Helper to build a mock decompressed Aadhaar QR payload buffer
  function buildMockDecompressedBuffer(
    demographicsArray: string[],
    photoBuffer: Buffer,
    signatureBuffer: Buffer
  ): Buffer {
    const delimiter = Buffer.from([255]);
    const fieldBuffers: Buffer[] = [];

    for (let i = 0; i < 16; i++) {
      const value = demographicsArray[i] ?? '';
      fieldBuffers.push(Buffer.from(value, 'utf-8'));
      fieldBuffers.push(delimiter);
    }

    fieldBuffers.push(photoBuffer);
    fieldBuffers.push(signatureBuffer);

    return Buffer.concat(fieldBuffers);
  }

  // Generate an RSA-2048 key pair for signature testing
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const mockDemographicsList = [
    '3', // 0: emailMobilePresentBit
    '202612345678', // 1: referenceId
    'Rishith Roy', // 2: name
    '15-08-1998', // 3: dob
    'M', // 4: gender
    'S/O John Doe', // 5: careOf
    'Bengaluru Urban', // 6: district
    'Near Metro Station', // 7: landmark
    'Flat 402', // 8: house
    'Indiranagar', // 9: location
    '560038', // 10: pincode
    'HAL II Stage SO', // 11: postOffice
    'Karnataka', // 12: state
    '100 Feet Road', // 13: street
    'Bengaluru North', // 14: subDistrict
    'Bengaluru', // 15: vtc
  ];

  const mockPhotoBytes = Buffer.from([0x00, 0xff, 0x4f, 0xff, 0x51, 0x12, 0x34]);

  describe('decompressQrPayload', () => {
    it('should decompress a valid zlib DEFLATE payload', () => {
      const originalText = Buffer.from('Hello Aadhaar QR Test Payload Data');
      const compressed = zlib.deflateSync(originalText);

      const decompressed = decompressQrPayload(compressed);
      expect(decompressed.toString('utf-8')).toBe('Hello Aadhaar QR Test Payload Data');
    });

    it('should decompress a raw DEFLATE payload without zlib headers', () => {
      const originalText = Buffer.from('Raw Deflate Payload Data Test');
      const compressed = zlib.deflateRawSync(originalText);

      const decompressed = decompressQrPayload(compressed);
      expect(decompressed.toString('utf-8')).toBe('Raw Deflate Payload Data Test');
    });

    it('should throw clear descriptive error when buffer is invalid or corrupt', () => {
      const invalidBuffer = Buffer.from([0x12, 0x34, 0x56, 0x78]);

      expect(() => decompressQrPayload(invalidBuffer)).toThrowError(/Zlib decompression failed/i);
    });

    it('should throw error when input is empty or invalid type', () => {
      expect(() => decompressQrPayload(Buffer.alloc(0))).toThrowError(/input buffer is empty/i);
      expect(() => decompressQrPayload(null as any)).toThrowError(/Invalid input/i);
    });
  });

  describe('parseAadhaarBuffer', () => {
    it('should correctly parse 16 demographic text fields, signedData, signature, and photo', () => {
      const dummySignature = crypto.randomBytes(256);
      const decompressed = buildMockDecompressedBuffer(
        mockDemographicsList,
        mockPhotoBytes,
        dummySignature
      );

      const result = parseAadhaarBuffer(decompressed);

      expect(result.signature).toHaveLength(256);
      expect(result.signature.equals(dummySignature)).toBe(true);

      const expectedSignedData = decompressed.subarray(0, decompressed.length - 256);
      expect(result.signedData.equals(expectedSignedData)).toBe(true);

      expect(result.demographics.emailMobilePresentBit).toBe('3');
      expect(result.demographics.referenceId).toBe('202612345678');
      expect(result.demographics.name).toBe('Rishith Roy');
      expect(result.demographics.dob).toBe('15-08-1998');
      expect(result.demographics.gender).toBe('M');
      expect(result.demographics.careOf).toBe('S/O John Doe');
      expect(result.demographics.district).toBe('Bengaluru Urban');
      expect(result.demographics.landmark).toBe('Near Metro Station');
      expect(result.demographics.house).toBe('Flat 402');
      expect(result.demographics.location).toBe('Indiranagar');
      expect(result.demographics.pincode).toBe('560038');
      expect(result.demographics.postOffice).toBe('HAL II Stage SO');
      expect(result.demographics.state).toBe('Karnataka');
      expect(result.demographics.street).toBe('100 Feet Road');
      expect(result.demographics.subDistrict).toBe('Bengaluru North');
      expect(result.demographics.vtc).toBe('Bengaluru');

      expect(result.demographics.photoJpeg2000.equals(mockPhotoBytes)).toBe(true);
    });

    it('should throw error when decompressed buffer is <= 256 bytes', () => {
      const shortBuffer = Buffer.alloc(200);
      expect(() => parseAadhaarBuffer(shortBuffer)).toThrowError(/too short/i);
    });

    it('should handle payload with fewer than 16 delimiters safely', () => {
      const shortDemographics = Buffer.concat([
        Buffer.from('3', 'utf-8'),
        Buffer.from([255]),
        Buffer.from('Ref123', 'utf-8'),
        Buffer.from([255]),
        Buffer.from('John Doe', 'utf-8'),
        Buffer.from([255]),
      ]);

      const dummySig = Buffer.alloc(256);
      const decompressed = Buffer.concat([shortDemographics, dummySig]);

      const parsed = parseAadhaarBuffer(decompressed);
      expect(parsed.demographics.emailMobilePresentBit).toBe('3');
      expect(parsed.demographics.referenceId).toBe('Ref123');
      expect(parsed.demographics.name).toBe('John Doe');
      expect(parsed.demographics.dob).toBe('');
      expect(parsed.demographics.photoJpeg2000).toHaveLength(0);
    });
  });

  describe('verifyAadhaarSignature', () => {
    it('should return true for a valid RSA-SHA256 signature', () => {
      const signedData = Buffer.from('UIDAI Aadhaar Test Signed Data String Payload');

      const signer = crypto.createSign('SHA256');
      signer.update(signedData);
      const validSignature = signer.sign({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      });

      const isVerified = verifyAadhaarSignature(signedData, validSignature, publicKey);
      expect(isVerified).toBe(true);
    });

    it('should return false for tampered signed data or invalid signature', () => {
      const signedData = Buffer.from('Original Aadhaar Payload Data');
      const tamperedData = Buffer.from('Tampered Aadhaar Payload Data');

      const signer = crypto.createSign('SHA256');
      signer.update(signedData);
      const validSignature = signer.sign({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      });

      const isVerified = verifyAadhaarSignature(tamperedData, validSignature, publicKey);
      expect(isVerified).toBe(false);
    });

    it('should return false when wrong public key is provided', () => {
      const signedData = Buffer.from('Payload Data');
      const signer = crypto.createSign('SHA256');
      signer.update(signedData);
      const signature = signer.sign({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      });

      const { publicKey: wrongPublicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const isVerified = verifyAadhaarSignature(signedData, signature, wrongPublicKey);
      expect(isVerified).toBe(false);
    });
  });

  describe('processAadhaarSecureQR', () => {
    it('should decompress, parse, and verify QR code payload end-to-end', () => {
      // 1. Build uncompressed payload text + photo
      const textParts = mockDemographicsList;
      const photoBuffer = mockPhotoBytes;

      const delimiter = Buffer.from([255]);
      const payloadBuffers: Buffer[] = [];
      for (let i = 0; i < 16; i++) {
        payloadBuffers.push(Buffer.from(textParts[i], 'utf-8'));
        payloadBuffers.push(delimiter);
      }
      payloadBuffers.push(photoBuffer);
      const signedData = Buffer.concat(payloadBuffers);

      // 2. Sign the signedData
      const signer = crypto.createSign('SHA256');
      signer.update(signedData);
      const signature = signer.sign({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      });

      // 3. Combine signedData + signature -> decompressed buffer
      const decompressedBuffer = Buffer.concat([signedData, signature]);

      // 4. Compress with zlib
      const rawQrBytes = zlib.deflateSync(decompressedBuffer);

      // 5. Process master function
      const result = processAadhaarSecureQR(rawQrBytes, publicKey);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe('Rishith Roy');
      expect(result.data?.referenceId).toBe('202612345678');
      expect(result.data?.pincode).toBe('560038');
      expect(result.data?.photoJpeg2000.equals(mockPhotoBytes)).toBe(true);
    });

    it('should return isValid: false if signature verification fails', () => {
      const signedData = Buffer.from('Corrupt Payload Data Stream');
      const dummySignature = crypto.randomBytes(256);
      const decompressedBuffer = Buffer.concat([signedData, dummySignature]);
      const rawQrBytes = zlib.deflateSync(decompressedBuffer);

      const result = processAadhaarSecureQR(rawQrBytes, publicKey);

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/verification failed/i);
    });

    it('should return isValid: false if zlib decompression fails', () => {
      const invalidQrBytes = Buffer.from([0x00, 0x11, 0x22, 0x33]);
      const result = processAadhaarSecureQR(invalidQrBytes, publicKey);

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/Zlib decompression failed/i);
    });
  });

  describe('matchAadhaarDemographics', () => {
    const mockAadhaarData: AadhaarDemographics = {
      referenceId: '12345678',
      name: 'Rishith M Roy',
      dob: '15-08-1998',
      gender: 'M',
      careOf: '',
      district: '',
      landmark: '',
      house: '',
      location: '',
      pincode: '',
      postOffice: '',
      state: '',
      street: '',
      subDistrict: '',
      vtc: '',
      emailMobilePresentBit: '3',
      photoJpeg2000: Buffer.alloc(0),
    };

    it('should return full_match when name, dob, and gender match', () => {
      const result = matchAadhaarDemographics(mockAadhaarData, {
        fullName: 'Rishith Roy',
        dob: new Date('1998-08-15'),
        gender: 'Male',
      });

      expect(result.matchType).toBe('full_match');
      expect(result.nameMatches).toBe(true);
      expect(result.dobMatches).toBe(true);
      expect(result.genderMatches).toBe(true);
    });

    it('should return mismatch when name and DOB do not match user profile', () => {
      const result = matchAadhaarDemographics(mockAadhaarData, {
        fullName: 'John Doe',
        dob: new Date('1990-01-01'),
        gender: 'Male',
      });

      expect(result.matchType).toBe('mismatch');
      expect(result.nameMatches).toBe(false);
      expect(result.dobMatches).toBe(false);
    });
  });
});
