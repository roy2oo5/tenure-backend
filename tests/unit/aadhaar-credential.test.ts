import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { extractJwtFromAadhaarZip } from '../../src/utils/aadhaar-credential';

describe('Aadhaar shared credential ZIP', () => {
  const token = 'eyJhbGciOiJSUzI1NiJ9.eyJuYW1lIjoiVGVzdCBVc2VyIn0.c2lnbmF0dXJl';

  it('extracts a JWT from a TXT file in a nested folder', () => {
    const zip = new AdmZip();
    zip.addFile('share/credential.txt', Buffer.from(`\uFEFFtoken: "${token}"\r\n`));
    expect(extractJwtFromAadhaarZip(zip.toBuffer())).toBe(token);
  });

  it('extracts a whitespace-wrapped JWT', () => {
    const zip = new AdmZip();
    zip.addFile('credential.txt', Buffer.from(token.replaceAll('.', ' .\n')));
    expect(extractJwtFromAadhaarZip(zip.toBuffer())).toBe(token);
  });

  it('extracts the issuer JWT from an SD-JWT TXT file', () => {
    const disclosure = Buffer.from(JSON.stringify(['salt', 'ResidentName', 'Test User'])).toString('base64url');
    const zip = new AdmZip();
    zip.addFile('sdjwt.txt', Buffer.from(`${token}~${disclosure}~`));
    expect(extractJwtFromAadhaarZip(zip.toBuffer())).toBe(token);
  });
});
