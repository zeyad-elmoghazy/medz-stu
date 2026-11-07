'use client';

import { useEffect, useRef, useState } from 'react';
import { updateStudentProfile } from '@/lib/student-api';
import { isDemoMode, readDemoProfile, writeDemoProfile } from '@/lib/supabase';
import { useStudentProfile } from '@/lib/use-display-name';
import { useUsernameAvailability } from '@/lib/use-username-availability';
import { normalizeUsername, validateUsername } from '@/lib/username';
import { Notice, PrimaryButton } from '@/components/student/profile/ui';

/**
 * Blocking "Finish setting up" prompt (choose a username) for students who
 * have none: those who signed up before usernames were required, and everyone
 * who signs up with Google (migration 044), who arrives without one. Unlike the academic-year prompt there is no
 * "Later": the leaderboard shows usernames instead of real names, and a
 * student without one is not ranked, so it stays until they pick one.
 *
 * It only covers the student UI. The leaderboard itself never lists a
 * student without a username (migration 039), so skipping the prompt by
 * other means can't expose a real name.
 */
export function UsernamePrompt() {
  const { loaded, needsUsername, refresh } = useStudentProfile();
  const [username, setUsername] = useState('');
  const check = useUsernameAvailability(username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = loaded && needsUsername;

  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  if (!visible) return null;

  const normalised = normalizeUsername(username);
  // 'unknown' (the check itself failed) must not trap the student: the
  // database rejects a taken name when they save.
  const canSave =
    !saving &&
    validateUsername(normalised) === null &&
    (check.status === 'available' || check.status === 'unknown');

  const help =
    check.status === 'invalid' || check.status === 'unavailable'
      ? { color: 'var(--error)', text: check.message }
      : check.status === 'checking'
        ? { color: 'var(--text3)', text: 'Checking…' }
        : check.status === 'available'
          ? { color: 'var(--success)', text: 'Available' }
          : {
              color: 'var(--text3)',
              text: '3–20 lowercase letters, numbers or underscores.',
            };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (isDemoMode()) {
        const demo = readDemoProfile();
        if (demo) writeDemoProfile({ ...demo, username: normalised });
      } else {
        await updateStudentProfile({ username: normalised });
      }
      await refresh(); // flips needsUsername → the prompt unmounts itself
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your username');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 101,
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
        aria-labelledby="username-prompt-title"
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
          <h2 id="username-prompt-title" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            Finish setting up
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 }}>
            Choose a username. The leaderboard shows usernames instead of real names, so
            nobody sees your name unless you want them to, and you need one to be ranked.
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>Username</span>
          <div style={{ position: 'relative' }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text3)',
                fontSize: 14,
              }}
            >
              @
            </span>
            <input
              ref={inputRef}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={20}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="choose_a_username"
              aria-describedby="username-prompt-help"
              aria-invalid={check.status === 'invalid' || check.status === 'unavailable'}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '11px 14px 11px 30px',
                borderRadius: 10,
                border: '1px solid var(--line2)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          <span
            id="username-prompt-help"
            aria-live="polite"
            style={{ fontSize: 11, color: help.color }}
          >
            {help.text}
          </span>
        </label>

        {error && <Notice kind="error">{error}</Notice>}

        <PrimaryButton type="submit" busy={saving} disabled={!canSave}>
          {saving ? 'Saving…' : 'Continue'}
        </PrimaryButton>
      </form>
    </div>
  );
}
