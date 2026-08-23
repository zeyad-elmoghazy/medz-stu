'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, LogOut, Moon } from 'lucide-react';
import { MediZeeLogo } from '@/components/brand/MediZeeLogo';
import { NavToast, useNavToast } from '@/components/ui/NavToast';
import {
  clearDemoProfile,
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
  type Profile,
} from '@/lib/supabase';

// =============================================================
// Catalog port of MedZ Home.dc.html → renderVals().catalog.
// Marketing surface, not user data — analogous to the dashboard's
// LOCKED array. Per-student progress numbers are NOT overlaid on
// this page (the design doesn't ask for it); this is the "store".
// =============================================================

type Category = 'basic' | 'clinical';

type SubjectEntry = {
  id: string;
  name: string;
  professor: string;
  profRole: string;
  profInitials: string;
  profAv: string;         // CSS gradient string
  qs: string;             // "450+", "520" — the design uses these labels verbatim
  category: Category;
  available: boolean;
  image?: string;         // /subjects/<name>.png — only 3 subjects have real images
  icon?: string;          // fallback emoji for the rest
  code?: string;          // "PHYS-101" style catalog code
};

// The `professor`/`profRole` fields are repurposed as the subject's
// curator label — kept for display shape only. Everything on MediZee is
// student-facing; there are no professor accounts.
const TBA_LABEL = 'Coming Soon';
const TBA_ROLE = 'Question bank in progress';
const TBA_AV = 'linear-gradient(135deg,#00A6A6,#33BFBF)';

const CATALOG: SubjectEntry[] = [
  { id: 'histology',    name: 'Histology',    professor: 'Curated by MediZee', profRole: '450+ MCQs · Live now', profInitials: 'MZ', profAv: 'linear-gradient(135deg,#00A6A6,#33BFBF)', qs: '450+', category: 'basic',    available: true,  image: '/subjects/histology.webp' },
  { id: 'anatomy',      name: 'Anatomy',      professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '520', category: 'basic',    available: false, image: '/subjects/anatomy.webp' },
  { id: 'pathology',    name: 'Pathology',    professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '480', category: 'clinical', available: false, image: '/subjects/pathology.webp' },
  { id: 'physiology',   name: 'Physiology',   professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '410', category: 'basic',    available: false, image: '/subjects/physiology.webp' },
  { id: 'biochemistry', name: 'Biochemistry', professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '360', category: 'basic',    available: false, image: '/subjects/biochemistry.webp' },
  { id: 'pharmacology', name: 'Pharmacology', professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '390', category: 'clinical', available: false, image: '/subjects/pharmacology.webp' },
  { id: 'microbiology', name: 'Microbiology', professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '340', category: 'clinical', available: false, image: '/subjects/microbiology.webp' },
  { id: 'immunology',   name: 'Immunology',   professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '280', category: 'clinical', available: false, image: '/subjects/immunology.webp' },
  { id: 'embryology',   name: 'Embryology',   professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '260', category: 'basic',    available: false, image: '/subjects/embryology.webp' },
  { id: 'parasitology', name: 'Parasitology', professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '240', category: 'clinical', available: false, image: '/subjects/parasitology.webp' },
  { id: 'genetics',     name: 'Genetics',     professor: TBA_LABEL, profRole: TBA_ROLE, profInitials: '', profAv: TBA_AV, qs: '220', category: 'basic',    available: false, image: '/subjects/genetics.webp' },
];

const AVAILABLE_COUNT = CATALOG.filter((s) => s.available).length;

const FILTERS = ['All Subjects', 'Available Now', 'Basic Sciences', 'Clinical', 'Coming Soon'] as const;
type Filter = (typeof FILTERS)[number];

function filterCatalog(all: SubjectEntry[], f: Filter): SubjectEntry[] {
  switch (f) {
    case 'All Subjects':   return all;
    case 'Available Now':  return all.filter((s) => s.available);
    case 'Basic Sciences': return all.filter((s) => s.category === 'basic');
    case 'Clinical':       return all.filter((s) => s.category === 'clinical');
    case 'Coming Soon':    return all.filter((s) => !s.available);
  }
}

// The 45° stripes background used behind emoji-only cards. Ported
// from the design's `stripes` constant.
const STRIPES_BG =
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 10px, rgba(255,255,255,0.012) 10px 20px), #132B45';

// =============================================================
// Page
// =============================================================

export default function StudentSubjectsPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [displayName, setDisplayName] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [filter, setFilter] = useState<Filter>('All Subjects');
  // Live per-subject published-question counts. Kept in a Map for
  // O(1) lookup when the catalog renders. Empty until the /api/
  // student/stats response arrives.
  const [liveCounts, setLiveCounts] = useState<Map<string, number>>(new Map());

  // Populate name from the demo profile (or real Supabase profile).
  // Same pattern as the dashboard — keeps the navbar user pill in
  // sync without extracting shared state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        if (demo?.full_name && !cancelled) setDisplayName(demo.full_name);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        const profile = data as Pick<Profile, 'full_name'> | null;
        if (!cancelled && profile?.full_name) setDisplayName(profile.full_name);
      } catch {
        /* leave blank on failure */
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Live counts. Re-fetches on tab focus so a professor publishing
  // in another tab reflects here immediately.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isDemoMode()) return;
      try {
        const res = await fetch('/api/student/stats', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          subjects?: Array<{ id: string; publishedCount?: number }>;
        };
        if (cancelled) return;
        const map = new Map<string, number>();
        for (const s of body.subjects ?? []) {
          if (typeof s.publishedCount === 'number') map.set(s.id, s.publishedCount);
        }
        setLiveCounts(map);
      } catch {
        /* silent — the catalog will show its default label */
      }
    }
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    clearDemoProfile();
    if (!isDemoMode()) await supabase.auth.signOut().catch(() => {});
    router.push('/login');
    router.refresh();
  }

  const filtered = filterCatalog(CATALOG, filter);

  // Canvas background — mirrors the dashboard so the subjects page
  // feels like the same product surface.
  const canvasBg: CSSProperties = {
    width: 1280,
    margin: '0 auto',
    position: 'relative',
    overflow: 'hidden',
    background:
      'radial-gradient(900px 520px at 88% -6%, rgba(0,166,166,0.3), transparent 60%),' +
      'radial-gradient(760px 520px at 6% 42%, rgba(88,28,235,0.18), transparent 55%),' +
      '#0B1F33',
    paddingBottom: 2,
  };

  const dotTexture: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
    backgroundSize: '26px 26px',
    opacity: 0.5,
    pointerEvents: 'none',
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0B1F33', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={canvasBg}>
        <div aria-hidden style={dotTexture} />

        <Navbar userLabel={displayName} signingOut={signingOut} onLogout={handleLogout} />

        <section style={{ position: 'relative', padding: '44px 44px 56px' }}>
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 24,
              marginBottom: 30,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: '#00A6A6',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                The MediZee Catalog
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 44,
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                  color: '#F7F9FA',
                }}
              >
                All Subjects
              </h1>
              <p
                style={{
                  margin: '12px 0 0',
                  fontSize: 14,
                  color: '#8B98A6',
                  maxWidth: 560,
                  lineHeight: 1.6,
                }}
              >
                Every module is built with a trusted lecturer — high-yield question banks, detailed
                explanations, and visual references from their own notes.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#33BFBF',
                  background: 'rgba(0,166,166,0.14)',
                  border: '1px solid rgba(0,166,166,0.4)',
                  padding: '8px 14px',
                  borderRadius: 10,
                }}
              >
                {CATALOG.length} subjects
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#8B98A6',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '8px 14px',
                  borderRadius: 10,
                }}
              >
                {AVAILABLE_COUNT} available now
              </span>
            </div>
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 26 }}>
            {FILTERS.map((f) => {
              const active = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  style={{
                    fontSize: 12,
                    fontWeight: active ? 700 : 600,
                    color: active ? '#F7F9FA' : '#8B98A6',
                    background: active
                      ? 'linear-gradient(135deg,#00A6A6,#33BFBF)'
                      : 'rgba(255,255,255,0.03)',
                    border: active
                      ? '1px solid transparent'
                      : '1px solid rgba(255,255,255,0.09)',
                    padding: '8px 15px',
                    borderRadius: 9,
                    cursor: 'pointer',
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>

          {/* Product grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 18,
            }}
          >
            {filtered.map((s) => (
              <SubjectCard key={s.id} subject={s} liveCount={liveCounts.get(s.id)} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div
              style={{
                marginTop: 30,
                padding: 40,
                textAlign: 'center',
                fontSize: 13,
                color: '#8B98A6',
                border: '1px dashed rgba(255,255,255,0.09)',
                borderRadius: 16,
              }}
            >
              No subjects match this filter yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// =============================================================
// Subject card — image variant OR emoji-code variant per design.
// =============================================================

function SubjectCard({
  subject: s,
  liveCount,
}: {
  subject: SubjectEntry;
  // Live count from the DB when available; falls back to the
  // catalog label ("450+", etc.) for demo mode or subjects the
  // stats endpoint didn't return.
  liveCount?: number;
}) {
  const liveCard: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 16,
    overflow: 'hidden',
    background: 'linear-gradient(165deg,#132B45,#0B1F33)',
    border: '1px solid rgba(0,166,166,0.5)',
    boxShadow: '0 0 0 1px rgba(0,166,166,0.28), 0 0 34px rgba(0,166,166,0.18)',
  };
  const baseCard: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#132B45',
    border: '1px solid rgba(255,255,255,0.07)',
  };

  const cardStyle = s.available ? liveCard : baseCard;

  // Subtle lift + slight scale on hover. Spring feels tactile
  // rather than the ease-out most sites default to. Locked cards
  // get the same treatment — the page still reads as a browseable
  // catalog, not a disabled list.
  return (
    <motion.div
      style={cardStyle}
      whileHover={{ y: -6, scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      {/* Thumbnail — 4:3 area */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          overflow: 'hidden',
          background: s.image ? (s.available ? '#132B45' : '#132B45') : STRIPES_BG,
        }}
      >
        {s.image ? (
          <Image
            src={s.image}
            alt={s.name}
            fill
            sizes="280px"
            style={{ objectFit: 'cover', opacity: s.available ? 1 : 0.55 }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 34, lineHeight: 1 }}>{s.icon}</span>
            <span
              style={{
                fontFamily: 'ui-monospace,Menlo,monospace',
                fontSize: 8,
                letterSpacing: '0.16em',
                color: '#8B98A6',
                textTransform: 'uppercase',
              }}
            >
              {s.code}
            </span>
          </div>
        )}

        {/* Corner tag */}
        <span
          style={
            s.available
              ? {
                  position: 'absolute',
                  top: 11,
                  left: 11,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#F7F9FA',
                  background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                  padding: '5px 10px',
                  borderRadius: 7,
                  boxShadow: '0 0 16px rgba(0,166,166,0.5)',
                }
              : {
                  position: 'absolute',
                  top: 11,
                  left: 11,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#8B98A6',
                  background: 'rgba(8,7,15,0.7)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  padding: '5px 9px',
                  borderRadius: 7,
                }
          }
        >
          {s.available ? '⚡ Available Now' : 'Coming Soon'}
        </span>

        {/* Locked dimmer sits on top of the image so the emoji cards
            (no image) don't get a double-darken. */}
        {!s.available && s.image && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,7,15,0.32)' }} />
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 16px 17px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: '#F7F9FA' }}>
          {s.name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11 }}>
          {s.available && (
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                flex: 'none',
                background: s.profAv,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#F7F9FA',
              }}
            >
              {s.profInitials}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: '#D9F3F0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {s.professor}
            </div>
            <div
              style={{
                fontSize: 9.5,
                color: '#8B98A6',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {s.profRole}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 13,
            fontSize: 11,
            color: '#8B98A6',
          }}
        >
          <span style={{ fontWeight: 700, color: '#33BFBF' }}>
            {typeof liveCount === 'number' ? liveCount : s.available ? 0 : '—'}
          </span>
          <span>questions</span>
        </div>

        <div style={{ marginTop: 15 }}>
          {s.available ? (
            <Link
              href={`/student/subjects/${s.id}`}
              style={{
                display: 'block',
                textAlign: 'center',
                textDecoration: 'none',
                fontSize: 12.5,
                fontWeight: 700,
                color: '#F7F9FA',
                background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
                padding: 10,
                borderRadius: 10,
                boxShadow: '0 0 18px rgba(0,166,166,0.4)',
                cursor: 'pointer',
              }}
            >
              Start Learning →
            </Link>
          ) : (
            <div
              aria-disabled
              style={{
                textAlign: 'center',
                fontSize: 12.5,
                fontWeight: 700,
                color: '#8B98A6',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: 10,
                borderRadius: 10,
                cursor: 'not-allowed',
              }}
            >
              Coming Soon
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================
// Navbar — same shape/pattern as the dashboard's inline navbar.
// Kept inline to avoid a shared-state refactor across pages.
// =============================================================

const NAV_LINKS: { label: string; href?: string; active?: boolean; toast?: string }[] = [
  { label: 'Home',           href: '/student/dashboard' },
  { label: 'Subjects',       active: true },
  { label: 'Custom Exam',    href: '/student/exam' },
  { label: 'Flashcards',     toast: 'Coming soon.' },
  { label: 'AI Tutor',       toast: 'Coming soon.' },
  { label: 'Leaderboard' },
];

function Navbar({
  userLabel,
  signingOut,
  onLogout,
}: {
  userLabel: string;
  signingOut: boolean;
  onLogout: () => void;
}) {
  const initials = userLabel
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const { message, showToast } = useNavToast();

  return (
    <>
    <nav
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 34px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <MediZeeLogo size="sm" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 30, fontSize: 13.5, fontWeight: 500 }}>
        {NAV_LINKS.map((link) => {
          if (link.href) {
            return (
              <Link
                key={link.label}
                href={link.href}
                style={{ color: '#8B98A6', textDecoration: 'none', cursor: 'pointer' }}
              >
                {link.label}
              </Link>
            );
          }
          if (link.toast) {
            // Not-yet-built nav items: click surfaces a floating
            // toast instead of a route change.
            return (
              <button
                key={link.label}
                type="button"
                onClick={() => showToast(link.toast!)}
                style={{
                  color: '#8B98A6',
                  fontWeight: 500,
                  fontSize: 13.5,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {link.label}
              </button>
            );
          }
          return (
            <span
              key={link.label}
              style={{
                color: link.active ? '#F7F9FA' : '#8B98A6',
                fontWeight: link.active ? 600 : 500,
              }}
            >
              {link.label}
            </span>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link
          href="/student/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            color: '#F7F9FA',
            background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
            padding: '9px 16px',
            borderRadius: 10,
            boxShadow: '0 0 18px rgba(0,166,166,0.4)',
            textDecoration: 'none',
          }}
        >
          My Progress
        </Link>

        <button
          type="button"
          aria-label="Toggle theme"
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8B98A6',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <Moon style={{ width: 15, height: 15 }} />
        </button>

        <Link
          href="/student/profile"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13.5,
            fontWeight: 600,
            color: '#8B98A6',
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg,#00A6A6,#33BFBF)',
              color: '#F7F9FA',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {initials || 'ME'}
          </span>
          {userLabel || 'Guest'}
        </Link>

        <button
          type="button"
          onClick={onLogout}
          disabled={signingOut}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13.5,
            fontWeight: 600,
            color: '#8B98A6',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {signingOut ? (
            <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
          ) : (
            <LogOut style={{ width: 13, height: 13 }} />
          )}
          Log out
        </button>
      </div>
    </nav>
    <NavToast message={message} />
    </>
  );
}
