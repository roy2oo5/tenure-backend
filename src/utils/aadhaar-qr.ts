import zlib from 'zlib';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Demographic information extracted from UIDAI Aadhaar Secure QR Code.
 */
export interface AadhaarDemographics {
  referenceId: string;
  name: string;
  dob: string; // DD-MM-YYYY
  gender: string; // M/F/O
  careOf: string;
  district: string;
  landmark: string;
  house: string;
  location: string;
  pincode: string;
  postOffice: string;
  state: string;
  street: string;
  subDistrict: string;
  vtc: string;
  emailMobilePresentBit: string;
  photoJpeg2000: Buffer; // Raw JP2 image stream
}

/**
 * Result of parsing decompressed Aadhaar QR payload buffer.
 */
export interface ParsedAadhaarQR {
  demographics: AadhaarDemographics;
  signedData: Buffer;
  signature: Buffer;
}

/**
 * Decompress the raw zlib/gzip DEFLATE byte array from UIDAI Secure QR payload.
 *
 * @param compressedBytes Raw binary buffer from QR code byte stream
 * @returns Decompressed byte buffer
 * @throws Error if decompression fails or input is invalid
 */
export function decompressQrPayload(compressedBytes: Buffer): Buffer {
  if (!compressedBytes || !(compressedBytes instanceof Buffer || compressedBytes instanceof Uint8Array)) {
    throw new Error('Invalid input: compressedBytes must be a valid Buffer or Uint8Array.');
  }

  const inputBuffer = Buffer.isBuffer(compressedBytes) ? compressedBytes : Buffer.from(compressedBytes);

  if (inputBuffer.length === 0) {
    throw new Error('Failed to decompress QR payload: input buffer is empty.');
  }

  // Attempt zlib DEFLATE decompression, with fallback to raw deflate and gzip streams
  try {
    return zlib.inflateSync(inputBuffer);
  } catch (zlibError) {
    try {
      return zlib.inflateRawSync(inputBuffer);
    } catch (rawError) {
      try {
        return zlib.unzipSync(inputBuffer);
      } catch (unzipError) {
        const detail = zlibError instanceof Error ? zlibError.message : String(zlibError);
        throw new Error(`Zlib decompression failed: Unable to decompress QR payload. ${detail}`);
      }
    }
  }
}

/**
 * Parse decompressed UIDAI buffer into demographic fields and signature components.
 *
 * Byte Layout:
 * - Total decompressed length must be > 256 bytes.
 * - Final 256 bytes: RSA-2048 Digital Signature.
 * - Bytes 0 to (N - 256): Signed Payload Data.
 * - Delimiter: Byte 255 (0xFF) separates demographic fields.
 *
 * Field Index Map:
 *  0: emailMobilePresentBit (Indicator byte e.g. "3")
 *  1: referenceId (Reference ID)
 *  2: name (Full Name)
 *  3: dob (Date of birth DD-MM-YYYY)
 *  4: gender (Gender M/F/O)
 *  5: careOf (Care of / C/O)
 *  6: district (District)
 *  7: landmark (Landmark)
 *  8: house (House/Building)
 *  9: location (Location/Locality)
 * 10: pincode (PIN Code)
 * 11: postOffice (Post Office)
 * 12: state (State)
 * 13: street (Street)
 * 14: subDistrict (Sub-District / Taluk)
 * 15: vtc (Village / Town / City)
 * 16: photoJpeg2000 (Raw JPEG2000 image stream buffer)
 *
 * @param decompressedBuffer Decompressed byte buffer of UIDAI Secure QR payload
 * @returns Parsed demographic details along with signed data and signature buffers
 */
export function parseAadhaarBuffer(decompressedBuffer: Buffer): ParsedAadhaarQR {
  if (!decompressedBuffer || !Buffer.isBuffer(decompressedBuffer)) {
    throw new Error('Invalid input: decompressedBuffer must be a Buffer.');
  }

  const SIGNATURE_LENGTH_BYTES = 256;

  if (decompressedBuffer.length <= SIGNATURE_LENGTH_BYTES) {
    throw new Error(
      `Decompressed buffer too short (${decompressedBuffer.length} bytes). Must be greater than ${SIGNATURE_LENGTH_BYTES} bytes to contain a valid RSA signature.`
    );
  }

  // 1. Slice the final 256 bytes as signature
  const signature = decompressedBuffer.subarray(decompressedBuffer.length - SIGNATURE_LENGTH_BYTES);

  // 2. Store all preceding bytes as signedData
  const signedData = decompressedBuffer.subarray(0, decompressedBuffer.length - SIGNATURE_LENGTH_BYTES);

  // 3. Delimit payload fields by byte 255 (0xFF)
  // We scan for the first 16 occurrences of delimiter 255 to extract text fields (indices 0 to 15).
  // Index 16 (the JPEG 2000 photo buffer) consists of all remaining bytes in signedData after the 16th delimiter.
  const textParts: string[] = [];
  let currentStart = 0;
  let delimiterCount = 0;

  for (let i = 0; i < signedData.length && delimiterCount < 16; i++) {
    if (signedData[i] === 255) {
      const fieldBuffer = signedData.subarray(currentStart, i);
      textParts.push(fieldBuffer.toString('utf-8'));
      currentStart = i + 1;
      delimiterCount++;
    }
  }

  // Extract raw photo JPEG 2000 buffer (index 16) safely from remaining signedData bytes
  let photoJpeg2000: Buffer;
  if (delimiterCount === 16 && currentStart <= signedData.length) {
    photoJpeg2000 = signedData.subarray(currentStart);
  } else {
    // Safety fallback if payload has fewer than 16 delimiters
    photoJpeg2000 = Buffer.alloc(0);
  }

  // Helper safety getter for demographic string text parts
  const getPart = (index: number): string => (index < textParts.length ? textParts[index] : '');

  const demographics: AadhaarDemographics = {
    emailMobilePresentBit: getPart(0),
    referenceId: getPart(1),
    name: getPart(2),
    dob: getPart(3),
    gender: getPart(4),
    careOf: getPart(5),
    district: getPart(6),
    landmark: getPart(7),
    house: getPart(8),
    location: getPart(9),
    pincode: getPart(10),
    postOffice: getPart(11),
    state: getPart(12),
    street: getPart(13),
    subDistrict: getPart(14),
    vtc: getPart(15),
    photoJpeg2000,
  };

  return {
    demographics,
    signedData,
    signature,
  };
}

/**
 * Verify UIDAI RSA-2048 signature using RSA-SHA256 with PKCS1 padding.
 *
 * @param signedData Buffer containing signed data (bytes preceding signature)
 * @param signature 256-byte RSA digital signature buffer
 * @param uidaiPublicKeyPem UIDAI RSA public key in PEM format
 * @returns true if signature is valid, false otherwise
 */
export function verifyAadhaarSignature(
  signedData: Buffer,
  signature: Buffer,
  uidaiPublicKeyPem: string
): boolean {
  if (!signedData || !signature || !uidaiPublicKeyPem || signature.length !== 256) {
    return false;
  }

  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(signedData);
    return verifier.verify(
      {
        key: uidaiPublicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      signature
    );
  } catch (err) {
    return false;
  }
}

/**
 * Result structure returned by processAadhaarSecureQR.
 */
export interface ProcessAadhaarResult {
  isValid: boolean;
  data?: AadhaarDemographics;
  error?: string;
}

/**
 * Helper to fetch UIDAI Public Key / Certificate PEM.
 * Checks process.env.UIDAI_PUBLIC_KEY_PEM first, then looks for uidai_auth_prod_2028.cer in backend root directory.
 */
export function getUidaiPublicKeyPem(): string | undefined {
  if (process.env.UIDAI_PUBLIC_KEY_PEM && process.env.UIDAI_PUBLIC_KEY_PEM.trim().length > 0) {
    return process.env.UIDAI_PUBLIC_KEY_PEM;
  }

  const certPath = path.join(process.cwd(), 'uidai_auth_prod_2028.cer');
  if (fs.existsSync(certPath)) {
    try {
      return fs.readFileSync(certPath, 'utf-8');
    } catch (_) {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Master orchestration function to decompress, parse, and verify UIDAI Aadhaar Secure QR Code.
 *
 * @param rawQrBytes Compressed binary buffer from QR code byte payload
 * @param uidaiPublicKeyPem UIDAI RSA public key in PEM format (optional, defaults to env or uidai_auth_prod_2028.cer)
 * @returns Object indicating validity, parsed demographics data, and optional error message
 */
export function processAadhaarSecureQR(
  rawQrBytes: Buffer,
  uidaiPublicKeyPem?: string
): ProcessAadhaarResult {
  try {
    // Step 1: Decompress raw QR byte stream
    const decompressedBuffer = decompressQrPayload(rawQrBytes);

    // Step 2: Parse buffer into demographic fields & signature
    const parsed = parseAadhaarBuffer(decompressedBuffer);

    // Determine target public key / certificate (explicit > env > uidai_auth_prod_2028.cer)
    const effectiveKey = (uidaiPublicKeyPem && uidaiPublicKeyPem.trim().length > 0)
      ? uidaiPublicKeyPem
      : getUidaiPublicKeyPem();

    // Step 3: Verify RSA Digital Signature if public key is supplied / loaded
    if (effectiveKey && effectiveKey.trim().length > 0) {
      const isValidSig = verifyAadhaarSignature(
        parsed.signedData,
        parsed.signature,
        effectiveKey
      );

      if (!isValidSig) {
        return {
          isValid: false,
          data: parsed.demographics,
          error: 'Digital signature verification failed: signature does not match public key.',
        };
      }
    }

    return {
      isValid: true,
      data: parsed.demographics,
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
