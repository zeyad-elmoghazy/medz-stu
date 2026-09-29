'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchCatalogueStats, fetchLandingModules, type CatalogueStats, type LandingModuleCard } from '@/lib/catalogue-stats';
import { getSubjectImage } from '@/lib/subject-images';

// The specific modules shown on the landing page's catalogue strip —
// one per year group is Anatomy/Spinal Cord's own module (205); the
// rest are real neighboring modules, published or not. Names come
// from the database (fetchLandingModules), not hardcoded here — this
// array is only the set of codes to ask for.
const LANDING_MODULE_CODES = ['101', '102', '103', '205', '206', '309', '310'];

type Theme = 'dark' | 'light';

const FEATURES = [
  {
    title: 'Instant split-view feedback',
    body: 'Answer and the screen splits: the corrected question on the left, a per-choice breakdown on the right. No waiting for a grade.',
    icon: (<><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="12" y1="4" x2="12" y2="20" /></>),
  },
  {
    title: 'Generate your own exams',
    body: 'Pick a subject, chapters, and length. MediZee builds a fresh mock exam, timed and graded, from the question bank.',
    icon: (<><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></>),
  },
  {
    title: 'Analytics and study streaks',
    body: 'Track accuracy over time, keep a daily streak alive, and see which topics need another pass, all from real attempts.',
    icon: (<><line x1="4" y1="20" x2="20" y2="20" /><rect x="6" y="11" width="3" height="7" /><rect x="11" y="7" width="3" height="11" /><rect x="16" y="14" width="3" height="4" /></>),
  },
  {
    title: 'Quiz on your mistakes',
    body: 'Re-run a challenge built only from the questions you got wrong. Results feed straight back into your accuracy.',
    icon: (<><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>),
  },
  {
    title: 'Bookmarks and in-quiz notes',
    body: 'Star any question and jot notes in a slide-in panel that auto-saves, per student, per question, ready for review week.',
    icon: (<path d="M6 4h12v17l-6-4-6 4z" />),
  },
  {
    title: 'Fullscreen exam mode',
    body: 'Challenges run in enforced fullscreen with tab-switch detection, real exam conditions, so your score means something.',
    icon: (<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />),
  },
];

const STEPS = [
  { title: 'Pick your subject', body: 'Choose an unlocked module — published chapters are ready to study. Creating a free account takes seconds and saves your progress.' },
  { title: 'Take the challenge', body: 'A timed, fullscreen run of high-yield MCQs with a live progress bar. Bookmark and take notes as you go.' },
  { title: 'Learn and track', body: 'Review split-view explanations, re-quiz your mistakes, and watch your accuracy and streak climb on your dashboard.' },
];

const PAGE_CSS = `
[data-mz-root]{background:var(--bg);color:var(--text);font-family:var(--font-sans),system-ui,sans-serif;transition:background .3s ease,color .3s ease}
[data-mz-root] a{color:inherit;text-decoration:none}
.mz-link{position:relative;color:var(--muted);font-size:14px;font-weight:500;transition:color .2s;padding:4px 0}
.mz-link::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;border-radius:2px;background:var(--accent-text);transform:scaleX(0);transform-origin:center;transition:transform .28s ease;opacity:0}
.mz-link:hover{color:var(--text)}
.mz-link:hover::after{transform:scaleX(.6);opacity:.6}
.mz-link.is-active{color:var(--text)}
.mz-link.is-active::after{transform:scaleX(1);opacity:1}
.mz-cta{transition:background .18s ease;cursor:pointer;border:none}
.mz-cta:hover{background:var(--accent-glow)}
.mz-ghost{transition:border-color .18s,color .18s,background .18s;cursor:pointer}
.mz-ghost:hover{border-color:var(--accent-text);color:var(--text);background:var(--fill)}
.mz-feat{transition:border-color .2s ease}
.mz-feat:hover{border-color:var(--accent-text)}
.mz-subj{transition:border-color .2s ease}
.mz-nav{will-change:background;transform:translateZ(0)}
.mz-subjects-scroller{scrollbar-width:thin;scrollbar-color:var(--line2) transparent;mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent)}
.mz-subjects-scroller::-webkit-scrollbar{height:8px}
.mz-subjects-scroller::-webkit-scrollbar-thumb{background:var(--line2);border-radius:8px}
.mz-subjects-scroller::-webkit-scrollbar-track{background:transparent}
@media (max-width:960px){
  [data-mz-root] .mz-nav-links{display:none!important}
  [data-mz-root] .mz-hero-h1{font-size:44px!important}
  [data-mz-root] .mz-h2{font-size:30px!important}
  [data-mz-root] .mz-grid-3,[data-mz-root] .mz-grid-subjects{grid-template-columns:1fr!important}
  [data-mz-root] .mz-final-h2{font-size:34px!important}
}
`;

const NAV_SECTIONS = ['features', 'how', 'catalogue', 'pricing'] as const;
type NavSection = typeof NAV_SECTIONS[number];

export default function MediZeeHome() {
  const [theme, setTheme] = useState<Theme>('light');
  const [activeSection, setActiveSection] = useState<NavSection | ''>('');
  const [catalogueStats, setCatalogueStats] = useState<CatalogueStats | null>(null);
  const [landingModules, setLandingModules] = useState<LandingModuleCard[] | null>(null);

  // Anon-readable — modules_public_read / chapters_public_read /
  // questions_read_published are all public-role RLS policies, no
  // session required. Confirmed live before wiring this in.
  useEffect(() => {
    let cancelled = false;
    fetchCatalogueStats().then((s) => {
      if (!cancelled) setCatalogueStats(s);
    });
    fetchLandingModules(LANDING_MODULE_CODES).then((m) => {
      if (!cancelled) setLandingModules(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // localStorage isn't available during SSR, so the saved theme can
  // only be read post-mount — a lazy useState initializer would read
  // it on the client's first render and mismatch the server-rendered
  // (always-'light') HTML. The anti-flash inline script in
  // app/layout.tsx's <head> already set document.documentElement's
  // data-mz-theme before first paint from the same localStorage key,
  // so this effect is just catching React's own state up to what's
  // already on screen (see the sync effect below).
  useEffect(() => {
    const saved = (typeof window !== 'undefined' && (window.localStorage.getItem('mz-theme') as Theme)) || 'light';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved);
  }, []);

  // The theme attribute now lives on <html> (not on this component's
  // own [data-mz-root] div) so the same value can theme every
  // [data-mz-root] wrapper in the tree — including the student
  // area's, mounted under a completely different component. React
  // state here stays the source of truth for this page's own UI
  // (the Sun/Moon icon), and this effect is what actually applies it.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.mzTheme = theme;
    }
  }, [theme]);

  useEffect(() => {
    const els = NAV_SECTIONS.map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const probe = window.scrollY + window.innerHeight * 0.35;
      let current: NavSection | '' = '';
      for (const el of els) {
        if (el.offsetTop <= probe) current = el.id as NavSection;
      }
      setActiveSection(prev => (prev === current ? prev : current));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (typeof window !== 'undefined') window.localStorage.setItem('mz-theme', next);
  };

  const isLight = theme === 'light';
  const anatomyPhoto = getSubjectImage('anatomy');

  return (
    <div data-mz-root style={{ minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* NAV */}
      <nav className="mz-nav" style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 44px', background: 'var(--nav-bg)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)' }}>
        <Link href="#top" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <Image src="/medizee-logo.webp" alt="MediZee" width={32} height={32} style={{ objectFit: 'cover' }} />
          </span>
          <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.5px', color: 'var(--text)' }}>MediZee</span>
        </Link>
        <div className="mz-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {NAV_SECTIONS.map(id => (
            <a key={id} className={`mz-link${activeSection === id ? ' is-active' : ''}`} href={`#${id}`}>
              {id === 'how' ? 'How it works' : id.charAt(0).toUpperCase() + id.slice(1)}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className="mz-ghost" style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, flex: 'none', borderRadius: 10, border: '1px solid var(--line2)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}>
            {isLight ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" /></svg>
            )}
          </button>
          <Link href="/login" className="mz-ghost" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text3)', padding: '9px 16px', borderRadius: 10, border: '1px solid var(--line2)', background: 'transparent' }}>Log in</Link>
          <Link href="/signup" className="mz-cta" style={{ fontSize: 13.5, fontWeight: 700, color: '#F7F9FA', padding: '10px 18px', borderRadius: 10, background: 'var(--accent-text)' }}>Sign up</Link>
        </div>
      </nav>

      {/* HERO */}
      <section id="top" style={{ position: 'relative', padding: '88px 40px 92px' }}>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 860, margin: '0 auto' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-text)', border: '1px solid var(--line2)', padding: '7px 14px', borderRadius: 999 }}>Built by students, for students</span>
          <h1 className="mz-hero-h1" style={{ margin: '28px 0 0', fontSize: 68, lineHeight: 1.04, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>
            Not another PDF <span style={{ color: 'var(--accent-text)' }}>in a Telegram group.</span>
          </h1>
          <p style={{ margin: '26px 0 0', maxWidth: 580, fontSize: 17, lineHeight: 1.65, color: 'var(--muted)' }}>
            MediZee is a full MCQ bank with instant split-view feedback. One place to drill, review, and see exactly where you&apos;re weak.
          </p>
          <div style={{ display: 'flex', gap: 15, alignItems: 'center', marginTop: 38, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/signup" className="mz-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#F7F9FA', background: 'var(--accent-text)', padding: '16px 32px', borderRadius: 12 }}>Start learning free</Link>
            <a href="#how" className="mz-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 16, fontWeight: 700, color: 'var(--text)', background: 'transparent', border: '1px solid var(--line2)', padding: '16px 30px', borderRadius: 12 }}>See how it works</a>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ position: 'relative', padding: '88px 44px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 52px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>Everything in one challenge</div>
          <h2 className="mz-h2" style={{ margin: '14px 0 0', fontSize: 40, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>Built for how medical students actually revise</h2>
          <p style={{ margin: '16px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--muted)' }}>Not a passive question dump, an active recall engine that adapts to you.</p>
        </div>
        <div className="mz-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
          {FEATURES.map(f => (
            <div key={f.title} className="mz-feat" style={{ background: 'var(--surface)', padding: 28 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
              <h3 style={{ margin: '18px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{f.title}</h3>
              <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ position: 'relative', padding: '76px 44px', background: 'var(--bg2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 54px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>How it works</div>
            <h2 className="mz-h2" style={{ margin: '14px 0 0', fontSize: 40, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>Three steps, straight after the lecture</h2>
          </div>
          <div className="mz-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22 }}>
            {STEPS.map((s, i) => (
              <div key={s.title} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '30px 26px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-text)' }}>{String(i + 1).padStart(2, '0')}</div>
                <h3 style={{ margin: '14px 0 0', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{s.title}</h3>
                <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{s.body}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 30, fontSize: 13, color: 'var(--faint)' }}>You can browse freely, you&apos;ll sign in only when you&apos;re ready to start answering.</div>
        </div>
      </section>

      {/* SUBJECTS */}
      <section id="catalogue" style={{ position: 'relative', padding: '88px 0' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 40px', padding: '0 44px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>The Catalogue</div>
          <h2 className="mz-h2" style={{ margin: '14px 0 0', fontSize: 40, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>Explore the full curriculum</h2>
          <p style={{ margin: '16px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--muted)' }}>
            {catalogueStats
              ? `${catalogueStats.moduleCount} modules, ${catalogueStats.chapterCount} chapters across the full curriculum.`
              : 'Loading the curriculum…'}
          </p>
        </div>
        <div className="mz-subjects-scroller" style={{ display: 'flex', gap: 18, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', padding: '4px 44px 24px', WebkitOverflowScrolling: 'touch' }}>
          <Link href="/signup" className="mz-subj" style={{ flex: 'none', width: 480, scrollSnapAlign: 'start', position: 'relative', borderRadius: 18, padding: 18, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
            <div style={{ position: 'relative', height: 220, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
              {anatomyPhoto && (
                <Image src={anatomyPhoto} alt="Anatomy" fill sizes="480px" style={{ objectFit: 'cover' }} />
              )}
              <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text)', background: 'var(--nav-bg)', border: '1px solid var(--line2)', padding: '5px 10px', borderRadius: 8, zIndex: 1 }}>Live now</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)', lineHeight: 1 }}>
                {landingModules?.find((m) => m.code === '205')?.name ?? 'Module 205'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                Module 205{catalogueStats ? `, ${catalogueStats.publishedQuestionCount} published questions` : ''}
              </div>
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text3)', flex: 1 }}>High-yield questions, detailed explanations, and visual references from every published chapter, live and ready to study.</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18, fontSize: 14, fontWeight: 700, color: '#F7F9FA', background: 'var(--accent-text)', padding: 13, borderRadius: 10 }}>Start learning</div>
          </Link>
          {(landingModules ?? []).map(m => (
            <div key={m.code} className="mz-subj" style={{ flex: 'none', width: 300, scrollSnapAlign: 'start', borderRadius: 18, padding: 18, border: '1px solid var(--line)', background: 'var(--card-locked)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--accent-text)', border: '1px solid var(--line2)', padding: '4px 8px', borderRadius: 6 }}>
                  MODULE {m.code}
                </span>
                {/* Real data, not a hardcoded per-card flag — same
                    publishedCount aggregate (sum of chapters.published_count
                    for this module) already confirmed correct on
                    /student/catalogue/[year], fetched here via the
                    anon-safe fetchLandingModules() instead of that
                    authenticated route. */}
                {m.publishedCount === 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', background: 'var(--fill)', border: '1px solid var(--line2)', padding: '4px 8px', borderRadius: 6, flex: 'none' }}>
                    Coming soon
                  </span>
                )}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 14, letterSpacing: '-.01em', color: 'var(--text2)' }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                Year {m.yearNum}{m.publishedCount > 0 ? `, ${m.publishedCount} published question${m.publishedCount === 1 ? '' : 's'}` : ''}
              </div>
            </div>
          ))}
          <div aria-hidden style={{ flex: 'none', width: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, padding: '0 44px' }}>
          <Link href="/signup" className="mz-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, color: '#F7F9FA', background: 'var(--accent-text)', padding: '14px 28px', borderRadius: 12 }}>Explore all subjects</Link>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ position: 'relative', padding: '80px 44px', background: 'var(--bg2)', borderTop: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>Pricing</div>
          <h2 className="mz-h2" style={{ margin: '14px 0 0', fontSize: 40, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>Free for now.</h2>
          <div style={{ marginTop: 34, background: 'var(--price-card)', border: '1px solid var(--line)', borderRadius: 20, padding: '38px 34px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>Student</div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>0 EGP</span>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--muted)' }}>Full access to every live module during the demo. No card required.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '28px 0 0', textAlign: 'left', borderTop: '1px solid var(--line)', paddingTop: 24 }}>
              {['Unlimited MCQ challenges', 'Personal analytics, streaks, and quiz-on-mistakes', 'Lecture-note references on every question'].map(b => (
                <div key={b} style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text3)' }}>{b}</div>
              ))}
            </div>
            <Link href="/signup" className="mz-cta" style={{ display: 'block', textAlign: 'center', width: '100%', marginTop: 28, fontSize: 15, fontWeight: 700, color: '#F7F9FA', background: 'var(--accent-text)', padding: 15, borderRadius: 12 }}>Create your free account</Link>
          </div>
          <p style={{ margin: '20px 0 0', fontSize: 12.5, color: 'var(--faint)' }}>Per-module pricing arrives in a later phase.</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ position: 'relative', padding: '96px 44px', textAlign: 'center' }}>
        <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
          <h2 className="mz-final-h2" style={{ margin: 0, fontSize: 44, lineHeight: 1.08, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>Your next lecture deserves better revision.</h2>
          <p style={{ margin: '20px 0 0', fontSize: 17, color: 'var(--muted)' }}>Sign up free and take a challenge tonight.</p>
          <div style={{ display: 'flex', gap: 15, justifyContent: 'center', marginTop: 34, flexWrap: 'wrap' }}>
            <Link href="/signup" className="mz-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#F7F9FA', background: 'var(--accent-text)', padding: '16px 32px', borderRadius: 12 }}>Start learning free</Link>
            <Link href="/login" className="mz-ghost" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', background: 'transparent', border: '1px solid var(--line2)', padding: '16px 30px', borderRadius: 12 }}>Log in</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--line)', padding: '34px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <Image src="/medizee-logo.webp" alt="MediZee" width={28} height={28} style={{ objectFit: 'cover' }} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>MediZee</span>
          <span style={{ fontSize: 12, color: 'var(--faint)', marginLeft: 6 }}>Medical education, engineered for recall.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/terms" className="mz-ghost" style={{ fontSize: 12.5, color: 'var(--faint)', border: 'none', padding: 0 }}>Terms of Service</Link>
          <Link href="/privacy" className="mz-ghost" style={{ fontSize: 12.5, color: 'var(--faint)', border: 'none', padding: 0 }}>Privacy Policy</Link>
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>© 2026 MediZee</span>
        </div>
      </footer>
    </div>
  );
}
