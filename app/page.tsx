'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';

type Theme = 'dark' | 'light';

const DOTS: Array<CSSProperties & { key: number }> = [
  { key: 0, left: '13%', top: '30%', width: 7, height: 7, background: '#9F67FF', boxShadow: '0 0 14px #9F67FF', ['--o' as any]: 0.5, ['--d' as any]: '15s', ['--dx' as any]: '18px', ['--dy' as any]: '-22px' },
  { key: 1, left: '24%', top: '66%', width: 5, height: 5, background: 'var(--text)', boxShadow: '0 0 10px #fff', ['--o' as any]: 0.3, ['--d' as any]: '19s', ['--dx' as any]: '-14px', ['--dy' as any]: '-16px' },
  { key: 2, left: '80%', top: '26%', width: 6, height: 6, background: '#10B981', boxShadow: '0 0 12px #10B981', ['--o' as any]: 0.4, ['--d' as any]: '17s', ['--dx' as any]: '12px', ['--dy' as any]: '20px' },
  { key: 3, left: '87%', top: '64%', width: 8, height: 8, background: '#9F67FF', boxShadow: '0 0 16px #9F67FF', ['--o' as any]: 0.5, ['--d' as any]: '21s', ['--dx' as any]: '-18px', ['--dy' as any]: '-14px' },
  { key: 4, left: '63%', top: '80%', width: 5, height: 5, background: '#9F67FF', boxShadow: '0 0 10px #9F67FF', ['--o' as any]: 0.4, ['--d' as any]: '14s', ['--dx' as any]: '16px', ['--dy' as any]: '-20px' },
  { key: 5, left: '39%', top: '18%', width: 4, height: 4, background: 'var(--text)', boxShadow: '0 0 8px #fff', ['--o' as any]: 0.3, ['--d' as any]: '23s', ['--dx' as any]: '-12px', ['--dy' as any]: '18px' },
];

const FEATURES = [
  {
    title: 'Instant split-view feedback',
    body: "Answer and the screen splits, corrected question on the left, a per-choice breakdown on the right. No waiting for a grade.",
    icon: (<><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="12" y1="4" x2="12" y2="20" /></>),
  },
  {
    title: 'Flashcards (coming soon)',
    body: 'Spaced-repetition decks generated from the same question bank, so every mistake becomes a card that comes back until it sticks.',
    icon: (<><path d="M5 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5z" /><line x1="5" y1="4" x2="5" y2="22" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /></>),
  },
  {
    title: 'Generate your own exams',
    body: 'Pick subjects, chapters, and length. MedZ builds a fresh mock exam, timed and graded, from the full MCQ bank.',
    icon: (<><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></>),
  },
  {
    title: 'AI Tutor (coming soon)',
    body: 'Ask why an answer is right, get an explanation grounded in the source notes. Available on any question, any time.',
    icon: (<><path d="M12 3l1.9 4.6L18 9l-3.5 3 1 4.9L12 15l-3.5 1.9L9.5 12 6 9l4.1-1.4L12 3z" /></>),
  },
  {
    title: 'Analytics & study streaks',
    body: "Track accuracy over time, keep a daily streak alive, and see which topics need another pass, all from real attempts.",
    icon: (<><line x1="4" y1="20" x2="20" y2="20" /><rect x="6" y="11" width="3" height="7" /><rect x="11" y="7" width="3" height="11" /><rect x="16" y="14" width="3" height="4" /></>),
  },
  {
    title: 'Quiz on your mistakes',
    body: 'Re-run a challenge built only from the questions you got wrong. Results feed straight back into your accuracy.',
    icon: (<><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>),
  },
  {
    title: 'Bookmarks & in-quiz notes',
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
  { title: 'Pick your subject', body: 'Choose an unlocked module, Histology is live now. Creating a free account takes seconds and saves your progress.' },
  { title: 'Take the challenge', body: 'A timed, fullscreen run of high-yield MCQs with a live progress bar. Bookmark and take notes as you go.' },
  { title: 'Learn & track', body: 'Review split-view explanations, re-quiz your mistakes, and watch your accuracy and streak climb on your dashboard.' },
];

const LOCKED = [
  { name: 'Anatomy', img: '/subjects/anatomy.webp', tint: 'rgba(59,130,246,.35)' },
  { name: 'Physiology', img: '/subjects/physiology.webp', tint: 'rgba(239,68,68,.35)' },
  { name: 'Biochemistry', img: '/subjects/biochemistry.webp', tint: 'rgba(16,185,129,.35)' },
  { name: 'Pharmacology', img: '/subjects/pharmacology.webp', tint: 'rgba(244,114,182,.35)' },
  { name: 'Pathology', img: '/subjects/pathology.webp', tint: 'rgba(234,179,8,.35)' },
];

const PAGE_CSS = `
[data-mz-root]{--bg:#08070F;--bg2:#0a0912;--surface:#0F0F1A;--text:#F8FAFC;--text2:#E2E8F0;--text3:#CBD5E1;--muted:#94A3B8;--faint:#64748B;--line:rgba(255,255,255,.07);--line2:rgba(255,255,255,.13);--fill:rgba(255,255,255,.04);--nav-bg:rgba(8,7,15,.72);--accent-card:linear-gradient(165deg,#1a1330,#0f0a1f);--price-card:linear-gradient(165deg,#1a1330,#0f0a1f);--card-locked:#0d0c15;--accent-text:#A78BFA}
[data-mz-root][data-mz-theme="light"]{--bg:#F6F5FB;--bg2:#ECEAF6;--surface:#FFFFFF;--text:#1B1826;--text2:#332E44;--text3:#524C68;--muted:#6E687F;--faint:#938DA6;--line:rgba(24,20,46,.10);--line2:rgba(24,20,46,.16);--fill:rgba(24,20,46,.035);--nav-bg:rgba(246,245,251,.82);--accent-card:linear-gradient(165deg,#F1EBFF,#FBF9FF);--price-card:linear-gradient(165deg,#EFE8FF,#FCFAFF);--card-locked:#FBFAFE;--accent-text:#7C3AED}
[data-mz-root]{background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif;transition:background .3s ease,color .3s ease}
[data-mz-root] a{color:inherit;text-decoration:none}
.mz-link{position:relative;color:var(--muted);font-size:14px;font-weight:500;transition:color .2s;padding:4px 0}
.mz-link::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;border-radius:2px;background:linear-gradient(90deg,#8B5CF6,#A855F7);transform:scaleX(0);transform-origin:center;transition:transform .28s ease;box-shadow:0 0 12px rgba(139,92,246,.7);opacity:0}
.mz-link:hover{color:var(--text)}
.mz-link:hover::after{transform:scaleX(.6);opacity:.6}
.mz-link.is-active{color:var(--text);text-shadow:0 0 18px rgba(139,92,246,.55)}
.mz-link.is-active::after{transform:scaleX(1);opacity:1}
.mz-cta{transition:transform .18s ease,box-shadow .18s ease,background .18s ease;cursor:pointer;border:none}
.mz-cta:hover{transform:translateY(-2px);box-shadow:0 0 40px rgba(124,58,237,.65)}
.mz-ghost{transition:border-color .18s,color .18s,background .18s;cursor:pointer}
.mz-ghost:hover{border-color:rgba(139,92,246,.7);color:var(--text);background:rgba(124,58,237,.14)}
.mz-feat{transition:transform .2s ease,border-color .2s ease,background .2s ease}
.mz-feat:hover{transform:translateY(-4px);border-color:rgba(139,92,246,.45);background:rgba(124,58,237,.06)}
.mz-subj{transition:transform .2s ease}
.mz-subj:hover{transform:translateY(-4px)}
@keyframes mzDrift{0%{transform:translate3d(0,0,0);opacity:0}25%{opacity:var(--o,.4)}50%{transform:translate3d(var(--dx,16px),var(--dy,-18px),0);opacity:calc(var(--o,.4)*1.5)}75%{opacity:var(--o,.4)}100%{transform:translate3d(0,0,0);opacity:0}}
.mz-dot{position:absolute;border-radius:9999px;animation:mzDrift var(--d,16s) ease-in-out infinite;pointer-events:none;will-change:transform,opacity}
.mz-hero-word{color:#8B5CF6;text-shadow:0 0 32px rgba(124,58,237,.55)}
.mz-featured-glow{box-shadow:0 0 36px rgba(124,58,237,.5)}
.mz-nav{will-change:background;transform:translateZ(0)}
.mz-subjects-scroller{scrollbar-width:thin;scrollbar-color:rgba(139,92,246,.4) transparent;mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent)}
.mz-subjects-scroller::-webkit-scrollbar{height:8px}
.mz-subjects-scroller::-webkit-scrollbar-thumb{background:rgba(139,92,246,.4);border-radius:8px}
.mz-subjects-scroller::-webkit-scrollbar-track{background:transparent}
@media (prefers-reduced-motion:reduce){.mz-dot{animation:none!important}}
@media (max-width:960px){
  [data-mz-root] .mz-nav-links{display:none!important}
  [data-mz-root] .mz-hero-h1{font-size:52px!important}
  [data-mz-root] .mz-h2{font-size:32px!important}
  [data-mz-root] .mz-grid-3,[data-mz-root] .mz-grid-subjects{grid-template-columns:1fr!important}
  [data-mz-root] .mz-final-h2{font-size:36px!important}
}
`;

const NAV_SECTIONS = ['features', 'how', 'subjects', 'pricing'] as const;
type NavSection = typeof NAV_SECTIONS[number];

export default function MedZHome() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeSection, setActiveSection] = useState<NavSection | ''>('');

  // localStorage isn't available during SSR, so the saved theme can
  // only be read post-mount — a lazy useState initializer would read
  // it on the client's first render and mismatch the server-rendered
  // (always-'dark') HTML.
  useEffect(() => {
    const saved = (typeof window !== 'undefined' && (window.localStorage.getItem('mz-theme') as Theme)) || 'dark';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved);
  }, []);

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

  return (
    <div data-mz-root data-mz-theme={theme} style={{ minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* NAV */}
      <nav className="mz-nav" style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 44px', background: 'var(--nav-bg)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)' }}>
        <Link href="#top" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#8B5CF6,#A855F7)', boxShadow: '0 0 18px rgba(139,92,246,.5)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <Image src="/medz-logo.webp" alt="MedZ" width={32} height={32} style={{ objectFit: 'cover' }} />
          </span>
          <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.5px', color: 'var(--text)' }}>MedZ</span>
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
            )}
          </button>
          <Link href="/login" className="mz-ghost" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text3)', padding: '9px 16px', borderRadius: 10, border: '1px solid var(--line2)', background: 'transparent' }}>Log in</Link>
          <Link href="/signup" className="mz-cta" style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', padding: '10px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', boxShadow: '0 0 22px rgba(124,58,237,.45)' }}>Sign up</Link>
        </div>
      </nav>

      {/* HERO */}
      <section id="top" style={{ position: 'relative', background: 'radial-gradient(920px 540px at 50% -8%,rgba(124,58,237,.34),transparent 62%),radial-gradient(620px 460px at 88% 118%,rgba(16,185,129,.13),transparent 60%),var(--bg)', overflow: 'hidden', padding: '78px 40px 88px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,.045) 0 1px,transparent 1px 58px),repeating-linear-gradient(90deg,rgba(255,255,255,.045) 0 1px,transparent 1px 58px)', WebkitMaskImage: 'radial-gradient(ellipse at center,#000 52%,transparent 100%)', maskImage: 'radial-gradient(ellipse at center,#000 52%,transparent 100%)', pointerEvents: 'none' }} />
        {DOTS.map(({ key, ...s }) => <span key={key} className="mz-dot" style={s} />)}

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--accent-text)', border: '1px solid rgba(139,92,246,.4)', background: 'rgba(124,58,237,.1)', padding: '7px 14px', borderRadius: 999 }}>✦ Built by students, for students</span>
          <h1 className="mz-hero-h1" style={{ margin: '28px 0 0', fontSize: 80, lineHeight: 0.98, fontWeight: 900, letterSpacing: '-.04em', color: 'var(--text)' }}>
            Not another <span className="mz-hero-word">PDF</span><br />in a Telegram group.
          </h1>
          <p style={{ margin: '26px 0 0', maxWidth: 600, fontSize: 17, lineHeight: 1.65, color: 'var(--muted)' }}>
            MedZ is a full MCQ bank with instant split-view feedback, generated mock exams, flashcards, and an AI tutor — one place to drill, review, and see exactly where you&apos;re weak.
          </p>
          <div style={{ display: 'flex', gap: 15, alignItems: 'center', marginTop: 38, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/signup" className="mz-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', padding: '17px 34px', borderRadius: 14, boxShadow: '0 0 34px rgba(124,58,237,.55)' }}>Start learning free <span style={{ fontSize: 18 }}>→</span></Link>
            <a href="#how" className="mz-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 16, fontWeight: 700, color: 'var(--accent-text)', background: 'rgba(124,58,237,.1)', border: '1px solid rgba(139,92,246,.45)', padding: '17px 30px', borderRadius: 14 }}>See how it works</a>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 46 }}>
            {['MCQ bank', 'Generated exams', 'Flashcards soon', 'AI tutor soon'].map(c => (
              <span key={c} style={{ fontSize: 12.5, color: 'var(--text3)', background: 'var(--fill)', border: '1px solid var(--line)', padding: '9px 15px', borderRadius: 999 }}>{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ position: 'relative', padding: '88px 44px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 52px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8B5CF6' }}>Everything in one challenge</div>
          <h2 className="mz-h2" style={{ margin: '14px 0 0', fontSize: 44, lineHeight: 1.08, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>Built for how medical students actually revise</h2>
          <p style={{ margin: '16px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--muted)' }}>Not a passive question dump, an active recall engine that adapts to you.</p>
        </div>
        <div className="mz-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} className="mz-feat" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 26 }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(124,58,237,.14)', border: '1px solid rgba(139,92,246,.32)', display: 'grid', placeItems: 'center', color: '#A78BFA' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
              </div>
              <h3 style={{ margin: '18px 0 0', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{f.title}</h3>
              <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ position: 'relative', padding: '76px 44px', background: 'radial-gradient(700px 400px at 50% 0%,rgba(124,58,237,.12),transparent 65%),var(--bg2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 54px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8B5CF6' }}>How it works</div>
            <h2 className="mz-h2" style={{ margin: '14px 0 0', fontSize: 44, lineHeight: 1.08, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>Three steps, straight after the lecture</h2>
          </div>
          <div className="mz-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22 }}>
            {STEPS.map((s, i) => (
              <div key={s.title} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '30px 26px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', display: 'grid', placeItems: 'center', boxShadow: '0 0 20px rgba(124,58,237,.5)' }}>{i + 1}</div>
                <h3 style={{ margin: '20px 0 0', fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{s.title}</h3>
                <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{s.body}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 30, fontSize: 13, color: 'var(--faint)' }}>You can browse freely, you&apos;ll sign in only when you&apos;re ready to start answering.</div>
        </div>
      </section>

      {/* SUBJECTS */}
      <section id="subjects" style={{ position: 'relative', padding: '88px 0' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 40px', padding: '0 44px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8B5CF6' }}>The catalog</div>
          <h2 className="mz-h2" style={{ margin: '14px 0 0', fontSize: 44, lineHeight: 1.08, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>Start with Histology</h2>
          <p style={{ margin: '16px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--muted)' }}>Six subjects on our roadmap. Scroll →</p>
        </div>
        <div className="mz-subjects-scroller" style={{ display: 'flex', gap: 18, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', padding: '4px 44px 24px', WebkitOverflowScrolling: 'touch' }}>
          <Link href="/signup" className="mz-subj mz-featured-glow" style={{ flex: 'none', width: 480, scrollSnapAlign: 'start', position: 'relative', borderRadius: 20, padding: 18, background: 'var(--accent-card)', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
            <div style={{ position: 'relative', height: 220, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(139,92,246,.3)' }}>
              <Image src="/subjects/histology.webp" alt="Histology" fill sizes="480px" style={{ objectFit: 'cover' }} />
              <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#DDD6FE', background: 'rgba(13,11,26,.8)', border: '1px solid rgba(139,92,246,.5)', padding: '5px 10px', borderRadius: 8, zIndex: 1 }}>✦ Live now</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
              <span style={{ width: 44, height: 44, borderRadius: 11, border: '1px solid rgba(139,92,246,.5)', flex: 'none', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', boxShadow: '0 0 16px rgba(124,58,237,.45)' }}>MZ</span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)', lineHeight: 1 }}>Histology</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>450+ MCQs · Curated by MedZ</div>
              </div>
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text3)', flex: 1 }}>High-yield questions, detailed explanations, and visual references — the first live subject in the MedZ bank.</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18, fontSize: 14, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', padding: 13, borderRadius: 12, boxShadow: '0 0 24px rgba(124,58,237,.45)' }}>Start learning →</div>
          </Link>
          {LOCKED.map(l => (
            <div key={l.name} className="mz-subj" style={{ flex: 'none', width: 300, scrollSnapAlign: 'start', borderRadius: 20, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--card-locked)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'relative', height: 160, overflow: 'hidden' }}>
                <Image src={l.img} alt={l.name} fill sizes="300px" style={{ objectFit: 'cover', filter: 'grayscale(.4) brightness(.75)' }} />
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${l.tint}, rgba(8,7,15,.55))` }} />
              </div>
              <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text2)' }}>{l.name}</div>
                <span style={{ marginTop: 'auto', alignSelf: 'flex-start', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', background: 'var(--fill)', border: '1px solid var(--line2)', padding: '5px 10px', borderRadius: 7 }}>🔒 Coming soon</span>
              </div>
            </div>
          ))}
          <div aria-hidden style={{ flex: 'none', width: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, padding: '0 44px' }}>
          <Link href="/signup" className="mz-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', padding: '15px 30px', borderRadius: 13, boxShadow: '0 0 28px rgba(124,58,237,.5)' }}>Explore all subjects <span style={{ fontSize: 17 }}>→</span></Link>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ position: 'relative', padding: '80px 44px', background: 'var(--bg2)', borderTop: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8B5CF6' }}>Pricing</div>
          <h2 className="mz-h2" style={{ margin: '14px 0 0', fontSize: 44, lineHeight: 1.08, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>Free For Now.</h2>
          <div style={{ marginTop: 34, background: 'var(--price-card)', border: '1px solid rgba(139,92,246,.3)', borderRadius: 22, padding: '38px 34px', boxShadow: '0 0 50px -20px rgba(124,58,237,.6)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>Student</div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 62, fontWeight: 900, letterSpacing: '-.03em', color: 'var(--text)' }}>0 EGP</span>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--muted)' }}>Full access to every live module during the demo. No card required.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '28px 0 0', textAlign: 'left' }}>
              {['Unlimited MCQ challenges', 'Personal analytics, streaks & quiz-on-mistakes', 'Generated mock exams and lecture-note references'].map(b => (
                <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, color: 'var(--text3)' }}><span style={{ color: '#10B981' }}>✓</span>{b}</div>
              ))}
            </div>
            <Link href="/signup" className="mz-cta" style={{ display: 'block', textAlign: 'center', width: '100%', marginTop: 28, fontSize: 15, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', padding: 15, borderRadius: 13, boxShadow: '0 0 28px rgba(124,58,237,.5)' }}>Create your free account</Link>
          </div>
          <p style={{ margin: '20px 0 0', fontSize: 12.5, color: 'var(--faint)' }}>Per-module pricing arrives in a later phase.</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ position: 'relative', padding: '96px 44px', textAlign: 'center', background: 'radial-gradient(700px 380px at 50% 120%,rgba(124,58,237,.3),transparent 65%),var(--bg)', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,.04) 0 1px,transparent 1px 58px),repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 58px)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 100%,#000 40%,transparent 100%)', maskImage: 'radial-gradient(ellipse at 50% 100%,#000 40%,transparent 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
          <h2 className="mz-final-h2" style={{ margin: 0, fontSize: 52, lineHeight: 1.05, fontWeight: 900, letterSpacing: '-.03em', color: 'var(--text)' }}>Your next lecture deserves better revision.</h2>
          <p style={{ margin: '20px 0 0', fontSize: 17, color: 'var(--muted)' }}>Sign up free and take a Histology challenge tonight.</p>
          <div style={{ display: 'flex', gap: 15, justifyContent: 'center', marginTop: 34, flexWrap: 'wrap' }}>
            <Link href="/signup" className="mz-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', padding: '17px 34px', borderRadius: 14, boxShadow: '0 0 34px rgba(124,58,237,.55)' }}>Start learning free <span style={{ fontSize: 18 }}>→</span></Link>
            <Link href="/login" className="mz-ghost" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-text)', background: 'rgba(124,58,237,.1)', border: '1px solid rgba(139,92,246,.45)', padding: '17px 30px', borderRadius: 14 }}>Log in</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--line)', padding: '34px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#8B5CF6,#A855F7)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <Image src="/medz-logo.webp" alt="MedZ" width={28} height={28} style={{ objectFit: 'cover' }} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>MedZ</span>
          <span style={{ fontSize: 12, color: 'var(--faint)', marginLeft: 6 }}>Medical education, engineered for recall.</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--faint)' }}>© 2026 MedZ</div>
      </footer>
    </div>
  );
}
