// Server-side file-upload guardrails. Content-Type headers are
// attacker-controlled; the magic-byte check is what actually stops
// a `.pdf.exe` from being renamed to `.pdf` and slipping past.
//
// Used from the professor upload routes (PDF ingest, Excel imports)
// before the file bytes are ever handed to pdf-parse / xlsx / OCR.

export type UploadKind = 'pdf' | 'excel' | 'image';

const ALLOWED_MIME: Record<UploadKind, string[]> = {
  pdf: ['application/pdf'],
  excel: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ],
  image: ['image/png', 'image/jpeg', 'image/webp'],
};

const MAX_SIZE: Record<UploadKind, number> = {
  pdf: 20 * 1024 * 1024,
  excel: 10 * 1024 * 1024,
  image: 8 * 1024 * 1024,
};

const SIGNATURES: Record<UploadKind, number[][]> = {
  // %PDF
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  // ZIP container (xlsx) or CFB (legacy xls)
  excel: [
    [0x50, 0x4b, 0x03, 0x04],
    [0xd0, 0xcf, 0x11, 0xe0],
  ],
  image: [
    [0x89, 0x50, 0x4e, 0x47], // PNG
    [0xff, 0xd8, 0xff], // JPEG
    [0x52, 0x49, 0x46, 0x46], // WEBP (RIFF header)
  ],
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

const matchesAny = (bytes: Uint8Array, sigs: number[][]) =>
  sigs.some((sig) => sig.every((b, i) => bytes[i] === b));

export async function validateFile(
  file: File,
  kind: UploadKind,
): Promise<FileValidationResult> {
  const limit = MAX_SIZE[kind];
  if (file.size > limit) {
    return {
      valid: false,
      error: `File exceeds ${Math.floor(limit / 1024 / 1024)}MB limit`,
    };
  }
  if (file.size === 0) {
    return { valid: false, error: 'Empty file' };
  }

  if (!ALLOWED_MIME[kind].includes(file.type)) {
    return { valid: false, error: `Unsupported MIME type: ${file.type}` };
  }

  // Read the first 8 bytes — enough for every signature above.
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!matchesAny(head, SIGNATURES[kind])) {
    return { valid: false, error: 'File content does not match declared type' };
  }

  return { valid: true };
}

// Filenames come from users. Reject anything but a short random slug
// with a normalized extension so the upload storage layer can never
// be tricked into ../ traversal, hidden dotfiles, or NTFS ADS.
export function safeFilename(originalName: string, prefix = 'upload'): string {
  const dot = originalName.lastIndexOf('.');
  const raw = dot >= 0 ? originalName.slice(dot + 1).toLowerCase() : '';
  const ext = raw.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}.${ext}`;
}
