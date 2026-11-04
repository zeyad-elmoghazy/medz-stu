'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  fetchCatalogueStats,
  fetchLandingModules,
  type CatalogueStats,
  type LandingModuleCard,
} from '@/lib/catalogue-stats';

type Theme = 'dark' | 'light';

const INSTAGRAM_URL = 'https://www.instagram.com/medizee_eg';
const TIKTOK_URL = 'https://www.tiktok.com/@medizee_eg';

// Nav links; the stats block (#metrics) has no link of its own and
// counts as part of "How it works".
const NAV = [
  { id: 'demo', label: 'How it works' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'soon', label: 'AI Tutor' },
  { id: 'faq', label: 'FAQ' },
] as const;
type NavId = (typeof NAV)[number]['id'];
const TRACKED_SECTIONS = ['demo', 'metrics', 'subjects', 'catalogue', 'soon', 'faq'] as const;

// Example chapters for the subject tabs (labelled as examples on the page).
const SUBJECTS = [
  { name: 'Anatomy', module: 'MODULE 205', chapters: ['Brain Stem', 'Cerebellum', 'Spinal Cord', 'Cranial Nerves', 'Basal Ganglia'] },
  { name: 'Physiology', module: 'MODULE 205', chapters: ['Membrane Potentials', 'Synaptic Transmission', 'Sensory Receptors', 'Motor Control', 'Autonomic Nervous System'] },
  { name: 'Histology', module: 'MODULE 205', chapters: ['Nervous Tissue', 'Neuroglia', 'Peripheral Nerve', 'Special Senses: Eye', 'Special Senses: Ear'] },
  { name: 'Microbiology', module: 'MODULE 309', chapters: ['Bacterial Structure', 'Gram-positive Cocci', 'Basic Virology', 'Mycology', 'Innate Immunity'] },
];

const FAQ = [
  { q: 'What is MediZee?', a: 'A full MCQ bank for medical students, organised by module, subject and chapter, with split-view feedback, analytics, bookmarks and quiz-on-mistakes.' },
  { q: 'Is it free?', a: 'Yes. Every live module is free right now, no card required.' },
  { q: 'Which modules are live?', a: 'The catalogue above shows every module and updates automatically: a module goes live the moment its first questions are published.' },
  { q: 'Where do the explanations come from?', a: "Every question links to a reference page from your department's own books and lecture notes." },
  { q: 'When is the AI Tutor coming?', a: "It's in the works. Sign up and you'll see it on your dashboard the day it launches." },
];

const EXAM_ROWS = [
  { key: 'B', ok: true, text: 'Spinal trigeminal nucleus (same-side face) plus spinothalamic tract (opposite-side body): lateral medullary syndrome.' },
  { key: 'A', ok: false, text: 'Medial medulla hits the pyramid and hypoglossal nerve: weakness and tongue deviation, not crossed sensory loss.' },
  { key: 'C', ok: false, text: 'A left-sided lesion would take out the left face, not the right.' },
  { key: 'D', ok: false, text: "The midbrain sits above the spinal trigeminal nucleus, so this crossed pattern doesn't fit." },
];

const fmt = (n: number) => n.toLocaleString('en-US');

// Page-local aliases on top of the shared [data-mz-root] tokens
// (app/globals.css), plus every animation. Motion is transform/opacity
// only, so it stays on the compositor; prefers-reduced-motion turns all
// of it off.
const PAGE_CSS = `
.mzl{--accent:var(--accent-text);--accent2:var(--accent-glow);--on-accent:#F7F9FA;--success-bg:rgb(var(--success-rgb) / .10);--glow:rgb(var(--accent-text-rgb) / .16);--shadow:rgba(28,27,24,.12);background:var(--bg);color:var(--text);font-family:var(--font-sans),system-ui,sans-serif;transition:background .4s ease,color .4s ease;overflow-x:clip;min-height:100vh}
html[data-mz-theme="dark"] .mzl{--bg2:#0B151B;--on-accent:#0F1B22;--success-bg:rgb(var(--success-rgb) / .14);--glow:rgb(var(--accent-text-rgb) / .18);--shadow:rgba(0,0,0,.45)}
.mzl a{color:inherit;text-decoration:none}
.mzl :focus-visible{outline:2.5px solid var(--accent);outline-offset:3px;border-radius:10px}
.mzl .eyebrow{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.mzl .h2{margin:14px 0 0;font-size:56px;line-height:1.02;font-weight:900;letter-spacing:-.035em}
.mzl .lede{margin:18px 0 0;font-size:18px;line-height:1.6;color:var(--muted)}
.mzl .card{background:var(--surface);border:1px solid var(--line);border-radius:24px}
.mzl .band{background:var(--bg2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.mzl .sec{padding:100px 44px}
.mzl .wrap{max-width:1180px;margin:0 auto}
.mzl .note{font-size:12px;color:var(--muted)}
.mzl .badge-soon{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:5px 9px;border-radius:999px;border:1px solid var(--line2);color:var(--muted)}

.mz-btn{display:inline-flex;align-items:center;gap:10px;font-weight:700;border-radius:999px;background:var(--accent);color:var(--on-accent)!important;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s ease}
.mz-btn:hover{transform:translateY(-2px);box-shadow:0 10px 30px -10px var(--accent)}
.mz-btn:active{transform:translateY(0) scale(.98)}
.mz-ghost{display:inline-flex;align-items:center;font-weight:700;border-radius:999px;border:1px solid var(--line2);background:transparent;color:var(--text);cursor:pointer;transition:border-color .2s ease,transform .25s cubic-bezier(.2,.8,.2,1)}
.mz-ghost:hover{border-color:var(--accent);transform:translateY(-2px)}
.mz-card{transition:transform .35s cubic-bezier(.2,.8,.2,1),border-color .25s ease}
.mz-card:hover{transform:translateY(-4px);border-color:var(--accent)}

.mz-nav{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 44px;background:var(--nav-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line);transition:box-shadow .3s ease}
.mz-nav.scrolled{box-shadow:0 8px 30px -18px var(--shadow)}
.nl{position:relative;padding:9px 15px;border-radius:999px;font-size:14px;font-weight:600;color:var(--muted)!important;transition:color .3s ease,background .35s ease,box-shadow .35s ease}
.nl::after{content:"";position:absolute;left:15px;right:15px;bottom:3px;height:2px;border-radius:2px;background:var(--accent);transform:scaleX(0);transition:transform .4s cubic-bezier(.2,.8,.2,1)}
.nl:hover{color:var(--text)!important}
.nl.on{color:var(--accent)!important;background:var(--glow);box-shadow:0 0 22px var(--glow)}
.nl.on::after{transform:scaleX(1)}

/* Bueno: three stacked layers (body, waving arm, head) cut from one render */
.bones{position:relative;display:block;width:100%;height:100%}
.bones img{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;pointer-events:none}
.bn-shadow{position:absolute;left:30%;right:30%;bottom:3%;height:5%;border-radius:50%;background:var(--shadow);filter:blur(6px);animation:bn-shadow 3.2s ease-in-out 1s infinite}
.bn-in{animation:bn-in .9s cubic-bezier(.34,1.56,.64,1) .1s both}
.bn-fig{transform-origin:50% 95%;animation:bn-bob 3.2s ease-in-out 1s infinite}
.bn-head{transform-origin:50% 49%;animation:bn-tilt 3.6s ease-in-out 1s infinite}
.bn-arm{transform-origin:65.2% 53.5%;animation:bn-wave 9s cubic-bezier(.45,0,.25,1) .6s infinite}
.bn-wrap:hover .bn-arm{animation:bn-wave-now 1.7s cubic-bezier(.45,0,.25,1) 0s 1}
@keyframes bn-in{0%{opacity:0;transform:translateY(40px) scale(.6)}100%{opacity:1;transform:none}}
@keyframes bn-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3%)}}
@keyframes bn-shadow{0%,100%{transform:scaleX(1);opacity:1}50%{transform:scaleX(.85);opacity:.7}}
@keyframes bn-tilt{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(4deg)}}
@keyframes bn-wave{0%{transform:rotate(0)}7%{transform:rotate(-122deg)}10%{transform:rotate(-104deg)}13%{transform:rotate(-134deg)}16%{transform:rotate(-104deg)}19%{transform:rotate(-134deg)}22%{transform:rotate(-108deg)}26%{transform:rotate(-120deg)}33%{transform:rotate(4deg)}36%,100%{transform:rotate(0)}}
@keyframes bn-wave-now{0%{transform:rotate(0)}14%{transform:rotate(-122deg)}26%{transform:rotate(-104deg)}38%{transform:rotate(-134deg)}50%{transform:rotate(-104deg)}62%{transform:rotate(-134deg)}74%{transform:rotate(-112deg)}100%{transform:rotate(0)}}
.bn-peek{animation:bn-peek 1.1s cubic-bezier(.34,1.56,.64,1) .3s both}
@keyframes bn-peek{0%{transform:translateY(100%)}100%{transform:translateY(0)}}

.up{animation:up .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes up{0%{opacity:0;transform:translateY(28px)}100%{opacity:1;transform:none}}
@supports (animation-timeline: view()){.rv{animation:up linear both;animation-timeline:view();animation-range:entry 5% entry 55%}}
.note-in{animation:note .6s cubic-bezier(.2,.8,.2,1) 1.4s both}
@keyframes note{0%{opacity:0;transform:translateY(8px) rotate(-8deg) scale(.8)}100%{opacity:1;transform:rotate(-6deg)}}
.pulse{animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 var(--glow)}50%{box-shadow:0 0 0 10px transparent}}

/* exam demo loop (9s) */
.ex-pick{animation:ex-pick 9s ease infinite}
@keyframes ex-pick{0%,18%{opacity:0;transform:scale(.97)}24%,90%{opacity:1;transform:none}96%,100%{opacity:0}}
.ex-cursor{animation:ex-cursor 9s cubic-bezier(.5,0,.2,1) infinite}
@keyframes ex-cursor{0%{opacity:0;transform:translate(120px,120px)}8%{opacity:1}18%{transform:translate(0,0)}20%{transform:translate(0,0) scale(.85)}24%{transform:translate(0,0) scale(1)}34%{opacity:1}40%,100%{opacity:0;transform:translate(0,0)}}
.ex-panel{animation:ex-panel 9s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes ex-panel{0%,28%{opacity:0;transform:translateX(36px)}36%,90%{opacity:1;transform:none}96%,100%{opacity:0;transform:translateX(12px)}}
.ex-row{animation:ex-row 9s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes ex-row{0%,32%{opacity:0;transform:translateY(10px)}40%,90%{opacity:1;transform:none}96%,100%{opacity:0}}
.ex-dim{animation:ex-dim 9s ease infinite}
@keyframes ex-dim{0%,26%{opacity:1}32%,90%{opacity:.45}96%,100%{opacity:1}}
.ex-choice{padding:15px 18px;border-radius:14px;border:1px solid var(--line2);font-size:15px;font-weight:500}

/* AI tutor chat loop (10s) */
.ch1{animation:ch1 10s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes ch1{0%,6%{opacity:0;transform:translateY(12px) scale(.96)}12%,92%{opacity:1;transform:none}98%,100%{opacity:0}}
.ch-typing{animation:chT 10s ease infinite}
@keyframes chT{0%,16%{opacity:0}20%,40%{opacity:1}44%,100%{opacity:0}}
.ch2{animation:ch2 10s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes ch2{0%,42%{opacity:0;transform:translateY(12px) scale(.96)}50%,92%{opacity:1;transform:none}98%,100%{opacity:0}}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--muted);animation:dot 1s ease-in-out infinite}
.dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
@keyframes dot{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-5px);opacity:1}}

/* catalogue marquee */
.mq-box{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.mq{display:flex;gap:16px;width:max-content;animation:mq 48s linear infinite}
.mq-box:hover .mq,.mq-box:focus-within .mq{animation-play-state:paused}
@keyframes mq{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

.tab-in{animation:up .5s cubic-bezier(.2,.8,.2,1) both}
.tab{font:inherit;font-size:15px;font-weight:700;min-height:44px;padding:10px 20px;border-radius:999px;cursor:pointer;border:1px solid var(--line2);background:transparent;color:var(--text);transition:background .25s ease,color .25s ease,border-color .25s ease,transform .25s cubic-bezier(.2,.8,.2,1)}
.tab:hover{border-color:var(--accent);transform:translateY(-2px)}
.tab[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.faq-a{display:grid;grid-template-rows:0fr;transition:grid-template-rows .35s cubic-bezier(.2,.8,.2,1)}
.faq-a.open{grid-template-rows:1fr}
.faq-a>div{overflow:hidden}
.faq-icon{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid var(--line2);display:grid;place-items:center;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.faq-icon.open{transform:rotate(45deg)}
.bar{transform-origin:left center}
.flink{display:inline-flex;align-items:center;min-height:44px}
.flink:hover{color:var(--text)}
.soc{width:44px;height:44px;border-radius:12px;border:1px solid var(--line2);display:grid;place-items:center;color:var(--text);transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .2s ease,color .2s ease}
.soc:hover{transform:translateY(-2px);border-color:var(--accent);color:var(--accent)!important}

@media (prefers-reduced-motion: reduce){
  .mzl *,.mzl *::after{animation:none!important;transition:none!important}
  .mzl .mq-box{overflow-x:auto}
}
@media (max-width:960px){
  .mzl .g2,.mzl .g4{grid-template-columns:minmax(0,1fr)!important}
  .mzl .nav-links{display:none!important}
  .mzl .h1{font-size:64px!important}
  .mzl .h1 .bn-slot{width:140px!important;height:140px!important}
  .mzl .h2{font-size:36px}
  .mzl .sec{padding:72px 20px}
}
@media (max-width:640px){
  .mzl .h1{font-size:46px!important;gap:2px!important}
  .mzl .h1 .bn-slot{width:112px!important;height:112px!important}
  .mzl .lead{font-size:24px!important}
  .mzl .h2{font-size:30px}
  .mzl .mz-nav{padding:12px 16px;gap:8px}
  .mzl .nav-btn{padding:11px 14px!important}
  .mzl .hide-sm{display:none!important}
  .mzl .ex-wrap{grid-template-columns:minmax(0,1fr)!important}
  .mzl .final-h2{font-size:38px!important}
  .mzl footer{padding:28px 20px!important}
}
@media (max-width:400px){
  .mzl .brand-word{display:none!important}
}
`;

type LandingPageProps = {
  /** Catalogue data loaded on the server (lib/landing-data.ts) so it is
   *  in the first-pass HTML. `null` means that load failed or came back
   *  empty — the page then fetches it on the client, as it always did. */
  stats: CatalogueStats | null;
  modules: LandingModuleCard[] | null;
};

export default function LandingPage({ stats: initialStats, modules: initialModules }: LandingPageProps) {
  const [theme, setTheme] = useState<Theme>('light');
  const [activeSection, setActiveSection] = useState<NavId | ''>('');
  const [scrolled, setScrolled] = useState(false);
  const [catalogueStats, setCatalogueStats] = useState<CatalogueStats | null>(initialStats);
  const [landingModules, setLandingModules] = useState<LandingModuleCard[] | null>(initialModules);

  // Client-side fallback only: when the server already supplied the
  // data there is nothing to fetch. Anon-readable — modules_public_read
  // / chapters_public_read are public-role RLS policies, no session
  // required.
  useEffect(() => {
    if (initialStats && initialModules) return;
    let cancelled = false;
    if (!initialStats) {
      fetchCatalogueStats().then((s) => {
        if (!cancelled) setCatalogueStats(s);
      });
    }
    if (!initialModules) {
      fetchLandingModules().then((m) => {
        if (!cancelled) setLandingModules(m);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [initialStats, initialModules]);

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

  // The theme attribute lives on <html> so the same value themes every
  // [data-mz-root] wrapper in the tree; this effect is what applies it.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.mzTheme = theme;
    }
  }, [theme]);

  // Active nav link: the last section whose top has passed 35% of the
  // viewport. Also drives the nav's shadow once the page has scrolled.
  useEffect(() => {
    const els = TRACKED_SECTIONS.map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const probe = window.scrollY + window.innerHeight * 0.35;
      let current: NavId | '' = '';
      for (const el of els) {
        if (el.offsetTop <= probe) current = (el.id === 'metrics' ? 'demo' : el.id) as NavId;
      }
      setActiveSection(prev => (prev === current ? prev : current));
      const isScrolled = window.scrollY > 8;
      setScrolled(prev => (prev === isScrolled ? prev : isScrolled));
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
  const modules = landingModules ?? [];
  const live = modules.filter(m => m.publishedCount > 0);
  const totalQs = catalogueStats?.publishedQuestionCount ?? live.reduce((s, m) => s + m.publishedCount, 0);
  const catalogueLine = modules.length
    ? `${fmt(totalQs)} questions live across ${live.length} module${live.length === 1 ? '' : 's'}.`
    : '';

  return (
    <div data-mz-root className="mzl">
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* NAV */}
      <nav aria-label="Primary" className={`mz-nav${scrolled ? ' scrolled' : ''}`}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          {/* Above the fold, so eager — the default lazy loading made the logo pop in after first paint. */}
          <Image src="/medizee-logo.webp" alt="MediZee" width={32} height={32} loading="eager" style={{ borderRadius: 9, objectFit: 'cover' }} />
          <span className="brand-word" style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.5px' }}>MediZee</span>
        </Link>
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {NAV.map(({ id, label }) => (
            <a key={id} href={`#${id}`} className={`nl${activeSection === id ? ' on' : ''}`} aria-current={activeSection === id ? 'true' : undefined}>
              {label}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={toggleTheme} aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'} className="mz-ghost" style={{ width: 44, height: 44, justifyContent: 'center', borderRadius: 12 }}>
            {isLight ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" /></svg>
            )}
          </button>
          <Link href="/login" className="mz-ghost nav-btn" style={{ fontSize: 14, fontWeight: 600, padding: '12px 18px', borderRadius: 12 }}>Log in</Link>
          <Link href="/signup" className="mz-btn nav-btn" style={{ fontSize: 14, padding: '12px 20px' }}>Sign up<span className="hide-sm">&nbsp;free</span></Link>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section id="top" style={{ padding: '84px 20px 110px', maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
          <div className="up" style={{ animationDelay: '.05s', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid var(--line2)', padding: '8px 16px', borderRadius: 999 }}>
            <span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
            Built by students, for students
          </div>
          <h1 className="h1" style={{ margin: '26px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6, fontSize: 112, lineHeight: 1, fontWeight: 900, letterSpacing: '-.045em' }}>
            <span className="up" style={{ animationDelay: '.1s' }}>Meet</span>
            <span className="bn-slot bn-wrap" style={{ position: 'relative', display: 'inline-block', width: 210, height: 210, flex: 'none' }}>
              <span className="bn-in bones" aria-hidden="true">
                <span className="bn-shadow" />
                <Bueno eager />
              </span>
              <span className="note-in hide-sm" aria-hidden="true" style={{ position: 'absolute', left: 170, top: -6, whiteSpace: 'nowrap', fontFamily: 'var(--font-caveat), cursive', fontSize: 26, fontWeight: 700, letterSpacing: 0, color: 'var(--accent)' }}>hi, I&apos;m Bueno!</span>
            </span>
            <span className="up" style={{ animationDelay: '.25s' }}>MediZee</span>
          </h1>
          <p className="lead up" style={{ animationDelay: '.4s', margin: '20px auto 0', maxWidth: 820, fontSize: 38, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-.02em' }}>
            The MCQ bank that shows you <span style={{ color: 'var(--accent)' }}>exactly where you&apos;re weak.</span>
          </p>
          <p className="up" style={{ animationDelay: '.5s', margin: '22px auto 0', maxWidth: 600, fontSize: 18, lineHeight: 1.65, color: 'var(--muted)' }}>
            Not another PDF in a Telegram group. Drill high-yield questions, get split-view feedback the second you answer, and watch your weak spots turn green.
          </p>
          <div className="up" style={{ animationDelay: '.6s', display: 'flex', gap: 14, justifyContent: 'center', marginTop: 38, flexWrap: 'wrap' }}>
            <Link href="/signup" className="mz-btn" style={{ fontSize: 17, padding: '18px 34px' }}>
              Start learning free
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
            <a href="#demo" className="mz-ghost" style={{ fontSize: 17, padding: '18px 32px' }}>See how it works</a>
          </div>
          <p className="up" style={{ animationDelay: '.7s', margin: '18px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            {catalogueLine} Free to start, no card required.
          </p>
        </section>

        {/* EXAM DEMO */}
        <section id="demo" className="sec band">
          <div className="wrap">
            <div className="rv" style={{ maxWidth: 720 }}>
              <div className="eyebrow">Instant split-view feedback</div>
              <h2 className="h2">Answer it like the exam. Learn it like a tutorial.</h2>
              <p className="lede">Pick an answer and the screen splits: your question on the left, a breakdown of every choice on the right.</p>
            </div>
            <div className="ex-wrap rv" style={{ marginTop: 52, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20, alignItems: 'start' }}>
              <div className="card" style={{ position: 'relative', padding: 30 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--accent)' }}>ANATOMY · BRAIN STEM</span>
                  <span>Q 7 / 20</span>
                </div>
                <div style={{ marginTop: 14, height: 6, borderRadius: 6, background: 'var(--fill)', overflow: 'hidden' }}>
                  <div style={{ width: '35%', height: '100%', background: 'var(--accent)', borderRadius: 6 }} />
                </div>
                <p style={{ margin: '22px 0 0', fontSize: 18, lineHeight: 1.55, fontWeight: 600 }}>
                  Loss of pain and temperature on the right side of the face and the left side of the body. Where is the lesion?
                </p>
                <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="ex-choice ex-dim">A. Right medial medulla</div>
                  <div className="ex-choice" style={{ position: 'relative' }}>
                    B. Right lateral medulla
                    <div className="ex-pick" aria-hidden="true" style={{ position: 'absolute', inset: -1, borderRadius: 14, border: '2px solid var(--success)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', fontSize: 15, fontWeight: 700, color: 'var(--success)' }}>
                      <span>B. Right lateral medulla</span>
                      <CheckIcon size={20} />
                    </div>
                    <span className="ex-cursor" aria-hidden="true" style={{ position: 'absolute', right: 60, top: 14, width: 22, height: 22 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 3l16 7-7 2-2 7z" fill="var(--text)" stroke="var(--bg)" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                    </span>
                  </div>
                  <div className="ex-choice ex-dim">C. Left lateral pons</div>
                  <div className="ex-choice ex-dim">D. Left midbrain</div>
                </div>
                <p className="note" style={{ margin: '18px 0 0' }}>Example question</p>
              </div>
              <div className="card ex-panel" style={{ padding: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--success-bg)', color: 'var(--success)', display: 'grid', placeItems: 'center' }}><CheckIcon size={18} /></span>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>Correct. Here&apos;s why every choice is what it is.</span>
                </div>
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {EXAM_ROWS.map((r, i) => (
                    <div key={r.key} className="ex-row" style={{ animationDelay: `${i * 0.15}s`, padding: '14px 16px', borderRadius: 14, background: r.ok ? 'var(--success-bg)' : 'var(--fill)', fontSize: 14, lineHeight: 1.55 }}>
                      <b style={r.ok ? { color: 'var(--success)' } : undefined}>{r.key}.{r.ok ? ' Correct.' : ''}</b> {r.text}
                    </div>
                  ))}
                </div>
                <div className="ex-row" style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z" /></svg>
                  Lecture-note reference attached
                </div>
              </div>
            </div>
          </div>
        </section>

        <Metrics />
        <SubjectTabs />

        {/* CATALOGUE */}
        <section id="catalogue" style={{ padding: '90px 0' }}>
          <div className="rv" style={{ textAlign: 'center', padding: '0 20px' }}>
            <div className="eyebrow">The catalogue</div>
            <h2 className="h2" style={{ fontSize: 44 }}>
              {modules.length ? `${live.length} module${live.length === 1 ? '' : 's'} live. ${modules.length - live.length} on the way.` : 'The full curriculum.'}
            </h2>
            <p className="lede" style={{ fontSize: 16 }}>
              {modules.length ? `${fmt(totalQs)} published questions so far. ` : ''}A module goes live here the moment its first questions are published.
            </p>
          </div>
          {modules.length > 0 && <ModuleMarquee modules={modules} />}
        </section>

        {/* COMING SOON: AI TUTOR */}
        <section id="soon" className="sec band">
          <div className="wrap">
            <div className="rv" style={{ textAlign: 'center' }}>
              <div className="eyebrow">Coming soon</div>
              <h2 className="h2">Meet your <span style={{ color: 'var(--accent)' }}>AI Tutor.</span></h2>
            </div>
            <div className="g2 rv" style={{ marginTop: 52, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20 }}>
              <div className="card" style={{ borderRadius: 26, padding: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)' }}>Soon</span>
                  <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>AI Tutor</h3>
                </div>
                <p style={{ margin: '14px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--muted)' }}>
                  Stuck on a question? Ask why. The tutor explains it your way, grounded in your department&apos;s own references.
                </p>
                <div aria-hidden="true" style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 230 }}>
                  <div className="ch1" style={{ alignSelf: 'flex-end', maxWidth: '78%', padding: '13px 16px', borderRadius: '18px 18px 4px 18px', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14.5, lineHeight: 1.5, fontWeight: 500 }}>Why is B right and not A?</div>
                  <div className="ch-typing" style={{ alignSelf: 'flex-start', display: 'inline-flex', gap: 5, padding: '14px 16px', borderRadius: '18px 18px 18px 4px', background: 'var(--fill)' }}><span className="dot" /><span className="dot" /><span className="dot" /></div>
                  <div className="ch2" style={{ alignSelf: 'flex-start', maxWidth: '86%', padding: '13px 16px', borderRadius: '18px 18px 18px 4px', background: 'var(--fill)', fontSize: 14.5, lineHeight: 1.55 }}>
                    A medial medulla lesion hits the pyramid and the hypoglossal nerve, so you&apos;d see weakness and tongue deviation. Crossed pain and temperature loss points lateral, so the answer is B.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <SoonCard title="Explain it simpler" body="One tap rewrites any explanation as a mnemonic, a step-by-step walk-through, or a two-line summary." />
                <SoonCard title="Plans built around your weak spots" body="The tutor reads your analytics and suggests what to drill next before the exam." />
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Planned, not available yet.</p>
              </div>
            </div>
          </div>
        </section>

        <Faq />

        {/* FINAL CTA */}
        <section className="band" style={{ padding: '110px 20px 0', textAlign: 'center', overflow: 'hidden', borderBottom: 'none' }}>
          <h2 className="h2 final-h2 rv" style={{ margin: '0 auto', maxWidth: 820, fontSize: 64, lineHeight: 1, letterSpacing: '-.04em' }}>Your next lecture deserves better revision.</h2>
          <p className="rv" style={{ margin: '20px 0 0', fontSize: 18, color: 'var(--muted)' }}>Sign up free and take a challenge tonight.</p>
          <div className="rv" style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 34, flexWrap: 'wrap' }}>
            <Link href="/signup" className="mz-btn" style={{ fontSize: 17, padding: '18px 34px' }}>Start learning free</Link>
            <Link href="/login" className="mz-ghost" style={{ fontSize: 17, padding: '18px 32px' }}>Log in</Link>
          </div>
          <div className="bn-wrap" style={{ position: 'relative', width: 280, height: 280, margin: '32px auto 0', paddingBottom: 12, overflow: 'hidden' }}>
            <div className="bn-peek" aria-hidden="true" style={{ width: 280, height: 280 }}>
              <Bueno />
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--line)', padding: '30px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Image src="/medizee-logo.webp" alt="" width={28} height={28} style={{ borderRadius: 8, objectFit: 'cover' }} />
          <span style={{ fontSize: 16, fontWeight: 800 }}>MediZee</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Medical education, engineered for recall.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px 20px', flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
          <Link href="/login" className="flink">Log in</Link>
          <Link href="/signup" className="flink">Sign up</Link>
          <Link href="/terms" className="flink">Terms of Service</Link>
          <Link href="/privacy" className="flink">Privacy Policy</Link>
          <span>© 2026 MediZee</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="MediZee on Instagram" className="soc">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>
            </a>
            <a href={TIKTOK_URL} target="_blank" rel="noopener noreferrer" aria-label="MediZee on TikTok" className="soc">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.4 2.6 2.2 4.4 5 4.6" /></svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Bueno, the mascot: body, waving arm and head as separate layers so
 *  only the arm and head move. Lossless 736px webp, served as-is. */
function Bueno({ eager = false }: { eager?: boolean }) {
  const load = eager ? ({ loading: 'eager', fetchPriority: 'high' } as const) : ({ loading: 'lazy' } as const);
  return (
    <span className="bn-fig bones">
      <Image src="/mascot/bueno-body.webp" alt="" width={736} height={736} unoptimized {...load} />
      <Image src="/mascot/bueno-arm.webp" alt="" width={736} height={736} unoptimized className="bn-arm" {...load} />
      <Image src="/mascot/bueno-head.webp" alt="" width={736} height={736} unoptimized className="bn-head" {...load} />
    </span>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
  );
}

function SoonCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card mz-card" style={{ borderRadius: 26, padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{title}</h3>
        <span className="badge-soon">Soon</span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--muted)' }}>{body}</p>
    </div>
  );
}

/** Example stats that count up once the block scrolls into view. Its own
 *  component so the per-frame updates only re-render this section. */
function Metrics() {
  const ref = useRef<HTMLElement>(null);
  const raf = useRef(0);
  const [p, setP] = useState(0);

  const run = () => {
    cancelAnimationFrame(raf.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setP(1);
      return;
    }
    let t0: number | null = null;
    const step = (ts: number) => {
      if (t0 === null) t0 = ts;
      const next = Math.min(1, (ts - t0) / 1800);
      setP(next);
      if (next < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        run();
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(el);
    const frame = raf;
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, []);

  const e = 1 - Math.pow(1 - p, 3);
  const streakOn = [1, 1, 1, 0, 1, 1, 1];
  const barH = [0.35, 0.5, 0.42, 0.7, 0.55, 0.82, 0.68, 1];
  const big = { marginTop: 12, fontSize: 54, fontWeight: 900, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums' } as const;
  const label = { fontSize: 13, fontWeight: 600, color: 'var(--muted)' } as const;
  const unit = { fontSize: 22, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0 } as const;

  return (
    <section id="metrics" ref={ref} className="sec wrap">
      <div className="rv" style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
        <div className="eyebrow">Analytics and streaks</div>
        <h2 className="h2">Progress in every subject.</h2>
        <p className="lede">Every challenge feeds your dashboard. Re-quiz your mistakes until they stick.</p>
      </div>
      <div className="g4" style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        <div className="card mz-card rv" style={{ borderRadius: 22, padding: 26 }}>
          <div style={label}>Accuracy, Brain Stem</div>
          <div style={big}>{Math.round(78 * e)}%</div>
          <div style={{ marginTop: 12, height: 8, borderRadius: 8, background: 'var(--fill)', overflow: 'hidden' }}>
            <div className="bar" style={{ height: '100%', background: 'var(--accent)', borderRadius: 8, transform: `scaleX(${(0.78 * e).toFixed(3)})` }} />
          </div>
          <div style={{ ...label, marginTop: 12, color: 'var(--success)' }}>up 12 points this block</div>
        </div>
        <div className="card mz-card rv" style={{ borderRadius: 22, padding: 26 }}>
          <div style={label}>Study streak</div>
          <div style={big}>{Math.round(14 * e)}<span style={unit}> days</span></div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5 }}>
            {streakOn.map((on, i) => (
              <span key={i} style={{ height: 18, borderRadius: 5, background: on && e > i / 7 ? 'var(--accent)' : 'var(--fill)', transition: 'background .3s ease' }} />
            ))}
          </div>
          <div style={{ ...label, marginTop: 12 }}>Missed Thursday, picked back up</div>
        </div>
        <div className="card mz-card rv" style={{ borderRadius: 22, padding: 26 }}>
          <div style={label}>Questions answered</div>
          <div style={big}>{fmt(Math.round(1240 * e))}</div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 5, height: 36 }}>
            {barH.map((h, i) => (
              <span key={i} style={{ flex: 1, height: '100%', borderRadius: 4, background: 'var(--accent)', opacity: 0.85, transformOrigin: 'bottom', transform: `scaleY(${(h * e).toFixed(3)})` }} />
            ))}
          </div>
          <div style={{ ...label, marginTop: 12 }}>across 4 subjects</div>
        </div>
        <div className="card mz-card rv" style={{ borderRadius: 22, padding: 26 }}>
          <div style={label}>Weak topics fixed</div>
          <div style={big}>{Math.round(9 * e)}<span style={{ ...unit, fontSize: 26 }}> of 12</span></div>
          <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>Quiz-on-mistakes turned red topics green</div>
          <div style={{ ...label, marginTop: 12, color: 'var(--success)' }}>accuracy 41% → 83%</div>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="note">Example numbers</span>
        <button type="button" onClick={run} className="mz-ghost" style={{ font: 'inherit', fontSize: 13, fontWeight: 600, minHeight: 44, padding: '10px 18px' }}>Replay count-up</button>
      </div>
    </section>
  );
}

/** Accessible tabs: arrow keys move between subjects (roving tabindex). */
function SubjectTabs() {
  const [sel, setSel] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = SUBJECTS[sel];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (sel + dir + SUBJECTS.length) % SUBJECTS.length;
    setSel(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="subjects" className="sec band">
      <div className="wrap g2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 56, alignItems: 'center' }}>
        <div className="rv">
          <div className="eyebrow">Whatever you&apos;re studying</div>
          <h2 className="h2">Every module. Every chapter. One place.</h2>
          <p className="lede">Questions are organised the way your department teaches them, with a reference page behind every answer.</p>
          <div role="tablist" aria-label="Subjects" style={{ marginTop: 30, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {SUBJECTS.map((s, i) => (
              <button
                key={s.name}
                ref={(el) => { tabs.current[i] = el; }}
                type="button"
                role="tab"
                id={`subj-tab-${i}`}
                aria-selected={i === sel}
                aria-controls="subj-panel"
                tabIndex={i === sel ? 0 : -1}
                onClick={() => setSel(i)}
                onKeyDown={onKey}
                className="tab"
              >
                {s.name}
              </button>
            ))}
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--muted)' }}>Tap a subject</p>
        </div>
        <div className="card rv" role="tabpanel" id="subj-panel" aria-labelledby={`subj-tab-${sel}`} style={{ padding: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{cur.name}</span>
            <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{cur.module}</span>
          </div>
          <ol key={cur.name} style={{ margin: '18px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cur.chapters.map((t, i) => (
              <li key={t} className="tab-in" style={{ animationDelay: `${i * 0.06}s`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderRadius: 14, background: 'var(--fill)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
                  <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>{i + 1}</span>
                  {t}
                </span>
                <span aria-hidden="true" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Practice →</span>
              </li>
            ))}
          </ol>
          <p className="note" style={{ margin: '16px 0 0' }}>Example chapters. Sign up to see the full catalogue.</p>
        </div>
      </div>
    </section>
  );
}

/** Live modules first, then the rest; the list is rendered twice for a
 *  seamless loop and the copy is hidden from assistive tech. */
function ModuleMarquee({ modules }: { modules: LandingModuleCard[] }) {
  const ordered = [...modules.filter(m => m.publishedCount > 0), ...modules.filter(m => m.publishedCount === 0)];
  const card = (m: LandingModuleCard, copy: boolean) => {
    const isLive = m.publishedCount > 0;
    return (
      <li key={`${copy ? 'b' : 'a'}-${m.code}`} aria-hidden={copy || undefined} className="mz-card" style={{ flex: 'none', width: 260, padding: 20, borderRadius: 20, border: `1px solid ${isLive ? 'var(--line2)' : 'var(--line)'}`, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--accent)', border: '1px solid var(--line2)', padding: '4px 8px', borderRadius: 6 }}>MODULE {m.code}</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 999, background: isLive ? 'var(--accent)' : 'var(--fill)', color: isLive ? 'var(--on-accent)' : 'var(--muted)' }}>{isLive ? 'Live' : 'Soon'}</span>
        </div>
        <div style={{ marginTop: 16, fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
          Year {m.yearNum}{isLive ? ` · ${fmt(m.publishedCount)} questions` : ''}
        </div>
      </li>
    );
  };
  return (
    <div className="mq-box" style={{ marginTop: 44 }}>
      <ul className="mq" aria-label="Modules" style={{ margin: 0, padding: '6px 0', listStyle: 'none' }}>
        {ordered.map(m => card(m, false))}
        {ordered.map(m => card(m, true))}
      </ul>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState<number>(0);
  return (
    <section id="faq" className="sec" style={{ maxWidth: 860, margin: '0 auto' }}>
      <h2 className="h2 rv" style={{ margin: 0, textAlign: 'center' }}>Questions.</h2>
      <div style={{ marginTop: 44, borderTop: '1px solid var(--line)' }}>
        {FAQ.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q} style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0 }}>
                <button
                  type="button"
                  id={`faq-q-${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-a-${i}`}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  style={{ font: 'inherit', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '24px 4px', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontSize: 19, fontWeight: 700 }}
                >
                  {f.q}
                  <span aria-hidden="true" className={`faq-icon${isOpen ? ' open' : ''}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                </button>
              </h3>
              <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className={`faq-a${isOpen ? ' open' : ''}`} inert={!isOpen}>
                <div>
                  <p style={{ margin: 0, padding: '0 4px 24px', maxWidth: 680, fontSize: 16, lineHeight: 1.65, color: 'var(--muted)' }}>{f.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
