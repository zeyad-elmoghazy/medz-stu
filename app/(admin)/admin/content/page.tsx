'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { MedZLogo } from '@/components/brand/MedZLogo';
import { fetchOverview, type AdminOverview } from '@/lib/admin-content-api';
import { AdminOverviewPanel } from '@/components/admin-content/AdminOverviewPanel';
import { AdminUploadWizard } from '@/components/admin-content/AdminUploadWizard';
import { AdminQuestionReview } from '@/components/admin-content/AdminQuestionReview';

type View = 'overview' | 'upload' | 'review';

type NavDef = { key: View; label: string; badge?: number };

export default function AdminContentPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [view, setView] = useState<View>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [adminName, setAdminName] = useState('Admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshOverview = useCallback(async () => {
    try {
      const o = await fetchOverview();
      setOverview(o);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load overview');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single();
          const p = data as { full_name: string | null; email: string | null } | null;
          if (!cancelled && p?.full_name) setAdminName(p.full_name);
          if (!cancelled && p?.email) setAdminEmail(p.email);
        }
      } catch {
        // best-effort
      }
      await refreshOverview();
    })();

    const interval = window.setInterval(() => {
      if (!cancelled) refreshOverview();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [supabase, refreshOverview]);

  const handleLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut().catch(() => {});
    router.push('/login');
    router.refresh();
  }, [signingOut, supabase, router]);

  const reviewBadge = overview?.counts.questions.under_review ?? 0;

  const navDef: NavDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'upload', label: 'Upload Content' },
    { key: 'review', label: 'Review Queue', badge: reviewBadge > 0 ? reviewBadge : undefined },
  ];

  const titles: Record<View, [string, string]> = {
    overview: ['Overview', 'Platform KPIs, daily activity, and the unified content log.'],
    upload: ['Upload Content', 'Add questions to any chapter — write them, extract from a PDF, or import a JSON batch.'],
    review: ['Review Queue', 'Browse, review, and publish every question in the bank.'],
  };

  const initials =
    adminName
      .split(/\s+/)
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'AD';

  const [pageTitle, pageSubtitle] = titles[view];

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#09090E',
        color: '#F8FAFC',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* ============ SIDEBAR ============ */}
      <aside
        style={{
          width: 248,
          flex: 'none',
          background: '#0F0F1A',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 26,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div style={{ padding: '0 8px' }}>
          <MedZLogo size="sm" />
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#64748B',
              padding: '0 10px 8px',
            }}
          >
            Content
          </div>
          {navDef.map((item) => {
            const active = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 10px',
                  borderRadius: 9,
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  color: active ? '#F8FAFC' : '#94A3B8',
                  background: active ? 'rgba(124,58,237,0.14)' : 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  width: '100%',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: active ? '#8B5CF6' : '#475569',
                    flex: 'none',
                  }}
                />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#0EA5E9',
                      background: 'rgba(14,165,233,0.14)',
                      padding: '2px 7px',
                      borderRadius: 10,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: 12,
            background: '#161B26',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              overflow: 'hidden',
              flex: 'none',
              border: '1px solid rgba(124,58,237,0.5)',
              background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {adminName}
            </div>
            <div
              style={{
                fontSize: 10,
                color: '#94A3B8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={adminEmail}
            >
              {adminEmail || 'Admin'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            title="Sign out"
            style={{
              width: 30,
              height: 30,
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#94A3B8',
              cursor: signingOut ? 'not-allowed' : 'pointer',
              opacity: signingOut ? 0.5 : 1,
            }}
          >
            {signingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
          </button>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: '28px 40px 64px',
          maxWidth: 1440,
        }}
      >
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#7C3AED',
              letterSpacing: '0.03em',
              marginBottom: 6,
            }}
          >
            Admin Content Console
          </div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em' }}>
            {pageTitle}
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#94A3B8', maxWidth: 560 }}>
            {pageSubtitle}
          </p>
        </header>

        {loadError && (
          <div
            role="alert"
            style={{
              marginBottom: 20,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              fontSize: 12.5,
              color: '#FCA5A5',
            }}
          >
            {loadError}
          </div>
        )}

        {view === 'overview' && (
          <AdminOverviewPanel
            overview={overview}
            onGoUpload={() => setView('upload')}
            onGoReview={() => setView('review')}
          />
        )}
        {view === 'upload' && <AdminUploadWizard onContentChanged={refreshOverview} />}
        {view === 'review' && <AdminQuestionReview onChanged={refreshOverview} />}
      </main>
    </div>
  );
}
