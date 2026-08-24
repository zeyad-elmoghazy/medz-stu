import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase';

const execFileP = promisify(execFile);

const CONCURRENCY = 5;
const NOTES_DPI = 150;

export interface NotesUploadResult {
  storagePrefix: string;
  pageCount: number;
}

// Rasterise every page of the notes PDF at NOTES_DPI and upload
// each PNG to the `notes-pages` bucket under {storagePrefix}/page-{N}.png.
// Uses the service-role key so it can write server-side without
// needing per-user Storage policies. Requires `pdftocairo` on $PATH.
export async function rasteriseAndUploadNotes(
  notesBuffer: Buffer,
  storagePrefix: string
): Promise<NotesUploadResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'notes-upload: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing'
    );
  }

  const tempDir = path.join(os.tmpdir(), `medz-notes-${storagePrefix}`);
  await fs.mkdir(tempDir, { recursive: true });
  const pdfPath = path.join(tempDir, 'notes.pdf');
  const outPrefix = path.join(tempDir, 'page');

  try {
    await fs.writeFile(pdfPath, notesBuffer);
    await execFileP('pdftocairo', ['-png', '-r', String(NOTES_DPI), pdfPath, outPrefix]);

    const files = (await fs.readdir(tempDir))
      .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
      .sort();

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (f) => {
          const num = parseInt(f.replace(/^page-|\.png$/g, ''), 10);
          const bytes = await fs.readFile(path.join(tempDir, f));
          const { error } = await supabase.storage
            .from('notes-pages')
            .upload(`${storagePrefix}/page-${num}.png`, bytes, {
              contentType: 'image/png',
              upsert: true,
            });
          if (error) throw new Error(`upload page ${num}: ${error.message}`);
        })
      );
    }

    return { storagePrefix, pageCount: files.length };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

// The URL the student browser fetches. Public bucket → no signing.
export function notesPageImageUrl(
  storagePrefix: string,
  page: number
): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return '';
  return `${base}/storage/v1/object/public/notes-pages/${storagePrefix}/page-${page}.png`;
}

// notes-pages is now a private bucket (018_notes_pages_private.sql) —
// this is the replacement for notesPageImageUrl above. Same
// service-role client pattern as serviceRoleClient() in
// lib/book-reference.ts: the service role key bypasses RLS
// entirely, so no client-facing SELECT policy is needed on this
// bucket. 15 min TTL — long enough to view the Reference tab, short
// enough that a leaked/logged URL doesn't stay valid indefinitely.
function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getSignedNotesPageUrl(
  storagePrefix: string,
  page: number
): Promise<string | null> {
  const supabase = serviceRoleClient();
  const { data, error } = await supabase.storage
    .from('notes-pages')
    .createSignedUrl(`${storagePrefix}/page-${page}.png`, 900);

  if (error || !data) {
    console.error('[notes-upload] createSignedUrl failed:', error?.message);
    return null;
  }
  return data.signedUrl;
}
