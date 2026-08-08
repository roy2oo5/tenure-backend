import crypto from 'crypto';
import jwt, { JwtHeader, JwtPayload } from 'jsonwebtoken';
import AdmZip from 'adm-zip';
import { AppError } from './app-error';

const UIDAI_CREDENTIAL_ISSUER = 'https://pehchaan.uidai.gov.in';
const UIDAI_JWKS_URL = `${UIDAI_CREDENTIAL_ISSUER}/.well-known/jwks.json`;
const UIDAI_JWKS_CACHE_MS = 60 * 60 * 1000;

type Jwk = crypto.JsonWebKey & { kid?: string; alg?: string; use?: string };
let cachedJwks: { expiresAt: number; keys: Jwk[] } | undefined;

// Snapshot of the UIDAI signing key currently used by Aadhaar App credentials.
// Online JWKS remains authoritative and refreshes this cache when reachable.
const BUNDLED_UIDAI_JWKS: Jwk[] = [{
  use: 'sig',
  kty: 'RSA',
  e: 'AQAB',
  kid: 'uidai-37a8e742-c375-443c-8ce5-8b7a0822cb6b',
  n: 'rHKsQEpYG8nmC-Jr8PKYqd8XMnZ3EIsd4wKmlLlppvNtCvdrJbBU8lmPmebSdnQa-nAkdWhRMn34zpbFcbU2KKLd4td0eubljxS3J6_mEFukyDB5-QVX7ktRZpaCeIBEc0Tt8YaD9vqkiaBhrWPIMKfw96zifzGxLbNjwKokNhpaHt-QKJe5TB5s7opS5GiJbnTjS6-PCFfDsrdrTplJOd9G8MIhgO1gnrwQ4ccPuyd4LBovB1MrCI8vUpyVV4RuCHSM3OtWgiAdLDgqDuBjfMiM4MUjlZrQCFPRL4K2XoeH5gGqaMfxta_X40n9bM4nnuqModC2T1MPWrQRh3nJbXfGaVB0QzdAWmOA7ZbDriQSbuRsVFgVy8DUcKlWRXhhCp5UqtZVFojWon1xkKZOhC9hpC67H7xLpGy6xRO8o_beqeGZNQs07jg65UVfFSKGzh3kRfN8kCKrIyuJLeT36qgilQOGOX0j_ZqN1Uuaf47O3NFz3xyj7J3ufHE1Y9aLoAzFakbYrEsHqzVJZKqf7v67HhU46ukI6CWqNlXtjdMgGYZG4LixhfXYVIbssjxJScvagE9nhpfjlZB-fnq3MIT57bVZRpEztBJJbcMSQQRc42ZH2GNb2yh-2Hi3UrCa8MiKGnYii5YILGPHjPrj_lNEByYpZq8RVzbAD89eYxc',
}];

export type AadhaarCredentialClaims = {
  name: string;
  dob: string;
  gender: string;
  maskedAadhaar: string;
  address: string;
  referenceId?: string;
  issuer?: string;
  credentialHash: string;
};

function findClaim(value: unknown, keys: Set<string>): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key.toLowerCase()) && (typeof child === 'string' || typeof child === 'number')) {
      const result = child.toString().trim();
      if (result) return result;
    }
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const result = findClaim(child, keys);
    if (result) return result;
  }
  return undefined;
}

function stringifyClaim(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return value.toString().trim() || undefined;
  }
  if (value && typeof value === 'object') {
    const parts = Object.values(value as Record<string, unknown>)
      .map((child) => stringifyClaim(child))
      .filter((child): child is string => Boolean(child));
    return parts.length ? parts.join(', ') : undefined;
  }
  return undefined;
}

function findStructuredClaim(value: unknown, keys: Set<string>): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key.toLowerCase())) {
      const result = stringifyClaim(child);
      if (result) return result;
    }
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const result = findStructuredClaim(child, keys);
    if (result) return result;
  }
  return undefined;
}

const compactJwsPattern = /([A-Za-z0-9_-]+={0,2})\s*\.\s*([A-Za-z0-9_-]+={0,2})\s*\.\s*([A-Za-z0-9_-]+={0,2})/;

type ExtractedSdJwt = {
  token: string;
  disclosures: Array<{ encoded: string; name: string; value: unknown }>;
};

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function compactJwsFromText(rawText: string): string | undefined {
  const candidates = [rawText.replace(/^\uFEFF/, '').replace(/\0/g, '')];
  try {
    candidates.push(decodeURIComponent(candidates[0]));
  } catch {
    // The credential is not URL encoded.
  }
  const compactBase64 = candidates[0].replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=_-]+$/.test(compactBase64) && compactBase64.length % 4 === 0) {
    try {
      candidates.push(Buffer.from(compactBase64, 'base64').toString('utf8'));
    } catch {
      // The TXT itself is not Base64 wrapped.
    }
  }
  for (const candidate of candidates) {
    const match = candidate.match(compactJwsPattern);
    if (match) return `${match[1]}.${match[2]}.${match[3]}`.replace(/=/g, '');
  }
  return undefined;
}

export function extractJwtFromAadhaarZip(zipBuffer: Buffer): string {
  return extractSdJwtFromAadhaarZip(zipBuffer).token;
}

function extractSdJwtFromAadhaarZip(zipBuffer: Buffer): ExtractedSdJwt {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new AppError('The shared file is not a valid Aadhaar ZIP.', 400);
  }
  const entries = zip.getEntries().filter(
    (entry) =>
      !entry.isDirectory &&
      entry.header.size > 0 &&
      entry.header.size < 2 * 1024 * 1024,
  );
  const orderedEntries = [...entries].sort((left, right) => {
    const leftTxt = left.entryName.toLowerCase().endsWith('.txt') ? 0 : 1;
    const rightTxt = right.entryName.toLowerCase().endsWith('.txt') ? 0 : 1;
    return leftTxt - rightTxt;
  });
  let textFileFound = false;
  for (const entry of orderedEntries) {
    if (entry.entryName.toLowerCase().endsWith('.txt')) textFileFound = true;
    let contents: Buffer;
    try {
      contents = entry.getData();
    } catch {
      throw new AppError('The Aadhaar ZIP could not be extracted.', 400);
    }
    const text = contents.toString('utf8').replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
    const token = compactJwsFromText(text);
    if (token) {
      const disclosures: ExtractedSdJwt['disclosures'] = [];
      for (const encoded of text.split('~').slice(1).filter(Boolean)) {
        try {
          const disclosure = JSON.parse(decodeBase64Url(encoded.trim()).toString('utf8')) as unknown;
          if (Array.isArray(disclosure) && disclosure.length >= 3 && typeof disclosure[1] === 'string') {
            disclosures.push({ encoded: encoded.trim(), name: disclosure[1], value: disclosure[2] });
          }
        } catch {
          // Ignore a key-binding token or malformed non-disclosure suffix.
        }
      }
      return { token, disclosures };
    }
  }
  throw new AppError(
    textFileFound
      ? 'The Aadhaar TXT was found, but it does not contain a supported signed JWT.'
      : 'No Aadhaar TXT credential was found in the ZIP.',
    400,
  );
}

async function getUidaiCredentialPublicKey(header: JwtHeader): Promise<string> {
  if (header.alg !== 'RS256' || !header.kid) {
    throw new AppError('The Aadhaar credential uses an unsupported signing key.', 400);
  }

  const configuredKey = process.env.AADHAAR_CREDENTIAL_PUBLIC_KEY_PEM?.replace(/\\n/g, '\n').trim();
  if (configuredKey) return configuredKey;

  let keys: Jwk[];
  try {
    if (!cachedJwks || cachedJwks.expiresAt <= Date.now()) {
      const response = await fetch(UIDAI_JWKS_URL, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`UIDAI JWKS returned ${response.status}`);
      const body = await response.json() as { keys?: Jwk[] };
      if (!Array.isArray(body.keys) || !body.keys.length) throw new Error('UIDAI JWKS is empty');
      cachedJwks = { keys: body.keys, expiresAt: Date.now() + UIDAI_JWKS_CACHE_MS };
    }
    keys = cachedJwks.keys;
  } catch (error) {
    if (error instanceof AppError) throw error;
    keys = BUNDLED_UIDAI_JWKS;
  }
  const jwk = keys.find(
    (candidate) => candidate.kid === header.kid && candidate.kty === 'RSA' && candidate.use === 'sig',
  );
  if (!jwk) {
    throw new AppError(
      keys === BUNDLED_UIDAI_JWKS
        ? 'UIDAI credential verification service is temporarily unavailable.'
        : 'The Aadhaar credential signing key is unknown.',
      keys === BUNDLED_UIDAI_JWKS ? 503 : 400,
    );
  }
  return crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({
    type: 'spki', format: 'pem',
  }).toString();
}

export async function processAadhaarCredentialZip(zipBuffer: Buffer): Promise<AadhaarCredentialClaims> {
  if (!zipBuffer.length || zipBuffer.length > 10 * 1024 * 1024) {
    throw new AppError('The shared Aadhaar ZIP is empty or too large.', 400);
  }
  const credential = extractSdJwtFromAadhaarZip(zipBuffer);
  const token = credential.token;

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded.payload === 'string') {
    throw new AppError('The Aadhaar credential is malformed.', 400);
  }
  if (decoded.payload.iss !== UIDAI_CREDENTIAL_ISSUER) {
    throw new AppError('The credential was not issued by UIDAI Pehchaan.', 400);
  }
  const publicKey = await getUidaiCredentialPublicKey(decoded.header);
  let payload: JwtPayload;
  try {
    const verified = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: UIDAI_CREDENTIAL_ISSUER,
    });
    if (typeof verified === 'string') throw new Error('Invalid claims');
    payload = verified;
  } catch {
    throw new AppError('The Aadhaar credential signature is invalid.', 400);
  }
  const allowedDisclosureDigests = new Set(
    Array.isArray(payload._sd) ? payload._sd.filter((item): item is string => typeof item === 'string') : [],
  );
  const disclosedClaims: Record<string, unknown> = {};
  for (const disclosure of credential.disclosures) {
    const digest = crypto.createHash('sha256').update(disclosure.encoded, 'ascii').digest('base64url');
    if (!allowedDisclosureDigests.has(digest)) {
      throw new AppError('The Aadhaar credential contains an invalid disclosure.', 400);
    }
    disclosedClaims[disclosure.name] = disclosure.value;
  }
  const issuer = findClaim(payload, new Set(['iss', 'issuer']));
  if (issuer !== UIDAI_CREDENTIAL_ISSUER) throw new AppError('The credential was not issued by UIDAI Pehchaan.', 400);
  const claims = { ...payload, ...disclosedClaims };
  const name = findClaim(claims, new Set(['name', 'fullname', 'residentname']));
  const dob = findClaim(claims, new Set(['dob', 'dateofbirth', 'birthdate']));
  const gender = findClaim(claims, new Set(['gender', 'sex']));
  const maskedAadhaar = findClaim(
    claims,
    new Set(['maskedaadhaar', 'masked_aadhaar', 'maskeduid', 'masked_uid']),
  );
  const address = findStructuredClaim(
    claims,
    new Set(['address', 'fulladdress', 'full_address', 'residentaddress']),
  );
  if (!name || !dob || !gender || !maskedAadhaar || !address) {
    throw new AppError('Aadhaar name, DOB, gender, masked Aadhaar, and address must be shared.', 400);
  }
  return {
    name,
    dob,
    gender,
    maskedAadhaar,
    address,
    issuer,
    referenceId: findClaim(
      claims,
      new Set(['referenceid', 'reference_id', 'refid', 'maskeduid']),
    ),
    credentialHash: crypto.createHash('sha256').update(zipBuffer).digest('hex'),
  };
}
