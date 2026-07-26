'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Mail, User, Bell, Moon, Sun } from 'lucide-react';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import {
  clearDemoProfile,
  createBrowserClient,
  isDemoMode,
  readDemoProfile,
  type Profile,
} from '@/lib/supabase';

const PREF_KEY = 'medz.studentPrefs';

type Prefs = {
  emailNotifications: boolean;
  reminderNotifications: boolean;
  theme: 'dark' | 'light';
};

const DEFAULT_PREFS: Prefs = {
  emailNotifications: true,
  reminderNotifications: true,
  theme: 'dark',
};

export default function ProfileSettingsPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    (async () => {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        if (demo?.full_name) setDisplayName(demo.full_name);
        if (demo?.email) setEmail(demo.email);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setEmail(user.email ?? '');
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        const profile = data as Pick<Profile, 'full_name'> | null;
        if (profile?.full_name) setDisplayName(profile.full_name);
      } catch {
        /* leave blank */
      }
    })();

    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {
      /* keep defaults */
    }
  }, [supabase]);

  function updatePrefs(patch: Partial<Prefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* localStorage may be blocked; UI still updates */
      }
      return next;
    });
  }

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    clearDemoProfile();
    if (!isDemoMode()) await supabase.auth.signOut().catch(() => {});
    router.push('/login');
    router.refresh();
  }

  const initials = displayName
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <main style={{ minHeight: '100vh', background: '#08070F', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <StudentNavbar />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 32px 80px' }}>
        <header style={{ marginTop: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: '#8B5CF6', textTransform: 'uppercase' }}>
            Profile &amp; Settings
          </p>
          <h1 style={{ margin: '10px 0 0', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: '#F8FAFC' }}>
            Your account
          </h1>
        </header>

        {/* Profile card */}
        <section
          style={{
            marginTop: 32,
            padding: 24,
            background: '#12111C',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <span
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 22,
              fontWeight: 800,
              flex: 'none',
            }}
          >
            {initials || 'ME'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#F8FAFC' }}>
              {displayName || 'Student'}
            </div>
            <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail style={{ width: 12, height: 12 }} />
              {email || 'No email on file'}
            </div>
          </div>
        </section>

        {/* Details form */}
        <Card title="Profile details">
          <Field
            icon={<User style={{ width: 14, height: 14 }} />}
            label="Full name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Your name"
          />
          <Field
            icon={<Mail style={{ width: 14, height: 14 }} />}
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
            disabled
            hint="Contact support to change the email tied to your account."
          />
        </Card>

        {/* Preferences */}
        <Card title="Preferences">
          <Toggle
            icon={<Bell style={{ width: 14, height: 14 }} />}
            label="Email notifications"
            hint="Weekly progress summary and new-content announcements."
            value={prefs.emailNotifications}
            onChange={(v) => updatePrefs({ emailNotifications: v })}
          />
          <Toggle
            icon={<Bell style={{ width: 14, height: 14 }} />}
            label="Study reminders"
            hint="A gentle nudge when your streak is at risk."
            value={prefs.reminderNotifications}
            onChange={(v) => updatePrefs({ reminderNotifications: v })}
          />
          <Toggle
            icon={prefs.theme === 'dark' ? <Moon style={{ width: 14, height: 14 }} /> : <Sun style={{ width: 14, height: 14 }} />}
            label="Dark theme"
            hint="Light theme is coming soon."
            value={prefs.theme === 'dark'}
            onChange={(v) => updatePrefs({ theme: v ? 'dark' : 'light' })}
          />
        </Card>

        {/* Session */}
        <Card title="Session">
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 700,
              color: '#FCA5A5',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 10,
              cursor: signingOut ? 'progress' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <LogOut style={{ width: 14, height: 14 }} />
            {signingOut ? 'Signing out…' : 'Log out'}
          </button>
        </Card>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        marginTop: 22,
        padding: 22,
        background: '#12111C',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#8B5CF6', textTransform: 'uppercase', marginBottom: 16 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {icon} {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          padding: '11px 14px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.1)',
          background: disabled ? 'rgba(255,255,255,0.02)' : '#0B0B14',
          color: '#F8FAFC',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      {hint && <span style={{ fontSize: 11, color: '#64748B' }}>{hint}</span>}
    </label>
  );
}

function Toggle({
  icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {icon} {label}
        </div>
        {hint && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          position: 'relative',
          width: 44,
          height: 24,
          borderRadius: 999,
          border: 'none',
          background: value ? 'linear-gradient(135deg,#7C3AED,#8B5CF6)' : 'rgba(255,255,255,0.12)',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  );
}
