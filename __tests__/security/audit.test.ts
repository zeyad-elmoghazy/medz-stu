// Unit-level checks for the security helpers introduced in the
// hardening pass. These are pure logic tests — they don't hit the
// network, the DB, or the Next runtime, so they run in every CI
// environment (including the one without Upstash / Supabase creds).
import { ApiError, handleApiError } from '@/lib/api-error';
import { safeFilename, validateFile } from '@/lib/file-validation';

// ------------------------ helpers ------------------------

// Minimal File shim — jsdom is not the default jest env here, so
// we build the smallest surface the validator actually reads.
function makeFile(bytes: number[], mime: string, name = 'x'): File {
  const arr = new Uint8Array(bytes);
  return {
    name,
    size: arr.byteLength,
    type: mime,
    slice: (start: number, end: number) => ({
      arrayBuffer: async () => arr.slice(start, end).buffer,
    }),
    arrayBuffer: async () => arr.buffer,
  } as unknown as File;
}

// ------------------------ api-error ------------------------

describe('handleApiError', () => {
  it('returns the custom message + status for ApiError', async () => {
    const res = handleApiError(new ApiError(403, 'nope'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'nope' });
  });

  it('collapses unknown throws to a 500 with a generic message', async () => {
    const res = handleApiError(new Error('secret internals: db_pass=hunter2'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(body)).not.toMatch(/hunter2/);
  });
});

// ------------------------ file-validation ------------------------

describe('validateFile', () => {
  const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
  const NOT_PDF = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07];
  const XLSX_ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00];

  it('accepts a well-formed PDF', async () => {
    const res = await validateFile(makeFile(PDF_HEADER, 'application/pdf'), 'pdf');
    expect(res.valid).toBe(true);
  });

  it('rejects a PDF-typed file whose magic bytes lie', async () => {
    const res = await validateFile(makeFile(NOT_PDF, 'application/pdf'), 'pdf');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/does not match/i);
  });

  it('rejects the wrong MIME type outright', async () => {
    const res = await validateFile(makeFile(PDF_HEADER, 'image/png'), 'pdf');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/MIME/);
  });

  it('rejects an empty file', async () => {
    const res = await validateFile(makeFile([], 'application/pdf'), 'pdf');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/empty/i);
  });

  it('rejects files over the size limit', async () => {
    // 21 MB PDF — validator should reject before touching the bytes.
    const big = {
      name: 'big.pdf',
      size: 21 * 1024 * 1024,
      type: 'application/pdf',
      slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
    } as unknown as File;
    const res = await validateFile(big, 'pdf');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/exceeds/i);
  });

  it('accepts an xlsx (ZIP container)', async () => {
    const res = await validateFile(
      makeFile(
        XLSX_ZIP,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
      'excel',
    );
    expect(res.valid).toBe(true);
  });
});

// ------------------------ safeFilename ------------------------

describe('safeFilename', () => {
  it('strips path traversal + preserves a short extension', () => {
    const name = safeFilename('../../etc/passwd.pdf', 'note');
    expect(name).toMatch(/^note_\d+_[a-z0-9]{8}\.pdf$/);
    expect(name).not.toContain('..');
    expect(name).not.toContain('/');
  });

  it('caps a monstrous extension', () => {
    const name = safeFilename(
      'x.' + 'a'.repeat(200),
      'up',
    );
    // Everything after the 8-char cap is dropped.
    expect(name.split('.')[1]).toHaveLength(8);
  });

  it('falls back to bin when no extension is present', () => {
    const name = safeFilename('README', 'note');
    expect(name.endsWith('.bin')).toBe(true);
  });

  it('every call produces a unique name', () => {
    const a = safeFilename('foo.pdf');
    const b = safeFilename('foo.pdf');
    expect(a).not.toBe(b);
  });
});
