import { ImageResponse } from 'next/og';

// Site-wide social card (og:image). Statically generated at build — no
// request-time APIs. Text-only on purpose: Satori can't reliably render
// the WebP logo, and a plain wordmark card is robust everywhere.
export const alt = 'MediZee — Medical MCQ question bank for exam prep';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#0F1B22';
const TEXT = '#F2F0EA';
const MUTED = '#96A19E';
const ACCENT = '#2FB8A8';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: BG,
          color: TEXT,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 18, height: 56, borderRadius: 6, background: ACCENT, marginRight: 24 }} />
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>MediZee</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>
            Medical MCQ question bank for exam prep
          </div>
          <div style={{ marginTop: 28, fontSize: 32, color: MUTED }}>
            Instant split-view feedback · Analytics · Study streaks
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: ACCENT }}>
          <div>Built by and for medical students</div>
          <div>www.medizee.app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
