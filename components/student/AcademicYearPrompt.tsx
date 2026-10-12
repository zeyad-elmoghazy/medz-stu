'use client';

import { useEffect, useRef, useState } from 'react';
import { ACADEMIC_YEARS, academicSession, formatAcademicYear } from '@/lib/academic-year';
import { updateStudentProfile } from '@/lib/student-api';
import { isDemoMode, readDemoProfile, writeDemoProfile } from '@/lib/supabase';
import { useStudentProfile } from '@/lib/use-display-name';
import { Notice, PrimaryButton } from '@/components/student/profile/ui';

const DISMISS_KEY = 'medz.academicYearPromptDismissed';

function wasDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * One-time "Which year are you in?" prompt for students who signed up
 * before the academic year was collected. Shown until they answer;
 * "Later" hides it for the rest of the browser session only, so it
 * returns on their next visit.
 */
export function AcademicYearPrompt() {
  const { loaded, needsAcademicYear, refresh } = useStudentProfile();
  const [dismissed, setDismissed] = useState(true); // assume hidden until we've checked storage
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const visible = loaded && needsAcademicYear && !dismissed;

  useEffect(() => {
    // sessionStorage only exists in the browser, so it can only be read
    // after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(wasDismissed());
  }, []);

  useEffect(() => {
    if (visible) selectRef.current?.focus();
  }, [visible]);

  if (!visible) return null;

  function later() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage blocked: it just won't be remembered */
    }
    setDismissed(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const chosen = Number(year);
    if (!ACADEMIC_YEARS.includes(chosen)) return;
    setSaving(true);
    setError(null);
    try {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        if (demo) {
          writeDemoProfile({
            ...demo,
            academic_year: chosen,
            academic_year_session: academicSession(),
          });
        }
      } else {
        await updateStudentProfile({ academic_year: chosen });
      }
      await refresh(); // flips needsAcademicYear → the prompt unmounts itself
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your year');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'rgb(0 0 0 / 0.55)',
      }}
    >
      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="academic-year-title"
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 24,
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--line2)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div>
          <h2 id="academic-year-title" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            Which year are you in?
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 }}>
            We&apos;ll keep it up to date for you — it moves up automatically every September.
          </p>
        </div>

        <select
          ref={selectRef}
          required
          value={year}
          onChange={(e) => setYear(e.target.value)}
          aria-label="Academic year"
          style={{
            padding: '11px 14px',
            borderRadius: 10,
            border: '1px solid var(--line2)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          <option value="" disabled>
            Select your year
          </option>
          {ACADEMIC_YEARS.map((y) => (
            <option key={y} value={y}>
              {formatAcademicYear(y)}
            </option>
          ))}
        </select>

        {error && <Notice kind="error">{error}</Notice>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <PrimaryButton type="submit" busy={saving} disabled={!year}>
            {saving ? 'Saving…' : 'Save'}
          </PrimaryButton>
          <button
            type="button"
            onClick={later}
            disabled={saving}
            style={{
              padding: '11px 14px',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              color: 'var(--text3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Later
          </button>
        </div>
      </form>
    </div>
  );
}
