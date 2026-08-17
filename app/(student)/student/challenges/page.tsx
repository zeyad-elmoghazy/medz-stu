'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Clock } from 'lucide-react';
import { StudentNavbar } from '@/components/student/StudentNavbar';

type Challenge = {
  id: string;
  title: string;
  module?: string;
  chapter?: string;
  questionCount: number;
  createdAt: string;
};

// Must match PostLecturePanel.tsx's STORAGE_KEY — the professor
// panel is the authoring source of truth for this data.
const STORAGE_KEY = 'medz.professor.challenges.v1';

export default function PostLectureChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);

  // The professor dashboard writes post-lecture challenges to
  // localStorage under the same key. Real backend wiring lives on
  // the professor side; students see whatever the professor has
  // published in this browser.
  //
  // localStorage isn't available during SSR, so this can only be
  // read post-mount — a lazy useState initializer would read it on
  // the client's first render and mismatch the server-rendered HTML.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChallenges([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setChallenges(Array.isArray(parsed) ? parsed : []);
    } catch {
      setChallenges([]);
    }
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#08070F', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <StudentNavbar activeLabel="Post-Lecture" />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 32px 80px' }}>
        <header style={{ marginTop: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: '#8B5CF6', textTransform: 'uppercase' }}>
            Post-Lecture Challenges
          </p>
          <h1 style={{ margin: '10px 0 8px', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: '#F8FAFC' }}>
            Reinforce today&apos;s lecture
          </h1>
          <p style={{ fontSize: 15, color: '#94A3B8', margin: 0, maxWidth: 640, lineHeight: 1.6 }}>
            Quick, focused question sets curated right after class. Attempt them while the
            material is still fresh.
          </p>
        </header>

        <section style={{ marginTop: 36 }}>
          {challenges === null && <SkeletonList />}

          {challenges?.length === 0 && (
            <div
              style={{
                borderRadius: 16,
                border: '1px dashed rgba(139,92,246,0.3)',
                background: 'rgba(124,58,237,0.05)',
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  margin: '0 auto 14px',
                  borderRadius: 12,
                  background: 'rgba(124,58,237,0.14)',
                  border: '1px solid rgba(139,92,246,0.35)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#C4B5FD',
                }}
              >
                <GraduationCap style={{ width: 20, height: 20 }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC' }}>
                No challenges yet
              </div>
              <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 6, maxWidth: 380, margin: '6px auto 0', lineHeight: 1.5 }}>
                No challenges posted yet. Check back after your next lecture — new sets appear
                here automatically.
              </div>
            </div>
          )}

          {challenges && challenges.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
              {challenges.map((c) => (
                <li
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '16px 18px',
                    background: '#12111C',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 14,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC' }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, display: 'flex', gap: 12 }}>
                      {c.module && <span>{c.module}</span>}
                      {c.chapter && <span>· {c.chapter}</span>}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock style={{ width: 11, height: 11 }} /> {c.questionCount} Qs
                      </span>
                    </div>
                  </div>
                  <Link
                    href="/student/quiz/histology"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#fff',
                      background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                      padding: '10px 16px',
                      borderRadius: 10,
                      textDecoration: 'none',
                    }}
                  >
                    Start
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function SkeletonList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 62,
            background: '#12111C',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 14,
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}
