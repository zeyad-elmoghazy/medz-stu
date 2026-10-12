'use client';

import { useState } from 'react';
import { BellIcon, LockIcon, LogOutIcon, MoonIcon, SunIcon } from '@/components/icons';
import type { ProfilePatch } from '@/lib/profile-schema';
import type { StudentProfileDto } from '@/lib/student-profile';
import { Card, Field, Notice, PrimaryButton, Toggle } from './ui';

export function SecurityCard({
  onChangePassword,
  unavailableReason,
}: {
  onChangePassword: (current: string, next: string) => Promise<void>;
  /** Set in demo mode, where there is no real account to change. */
  unavailableReason?: string;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < 8;
  const ready = !!current && next.length >= 8 && confirm === next && !unavailableReason;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await onChangePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card title="Security" description="Change the password you use to log in.">
        {unavailableReason ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>{unavailableReason}</p>
        ) : (
          <>
            <Field
              icon={<LockIcon size={14} />}
              label="Current password"
              type="password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
            <Field
              icon={<LockIcon size={14} />}
              label="New password"
              type="password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              error={tooShort ? 'Password must be at least 8 characters' : null}
            />
            <Field
              icon={<LockIcon size={14} />}
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              error={mismatch ? 'Passwords do not match' : null}
            />
            {error && <Notice kind="error">{error}</Notice>}
            {done && <Notice kind="success">Password updated.</Notice>}
            <PrimaryButton type="submit" busy={busy} disabled={!ready}>
              {busy ? 'Updating…' : 'Update password'}
            </PrimaryButton>
          </>
        )}
      </Card>
    </form>
  );
}

export function PreferencesCard({
  profile,
  onSave,
  theme,
  setTheme,
}: {
  profile: StudentProfileDto;
  onSave: (patch: ProfilePatch) => Promise<void>;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: ProfilePatch) {
    setBusy(true);
    setError(null);
    try {
      await onSave(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your preference');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Preferences">
      <Toggle
        icon={<BellIcon size={14} />}
        label="Email notifications"
        hint="Weekly progress summary and new-content announcements. Saved to your account; emails aren't being sent yet."
        value={profile.notifyEmail}
        disabled={busy}
        onChange={(v) => void save({ notify_email: v })}
      />
      <Toggle
        icon={<BellIcon size={14} />}
        label="Study reminders"
        hint="A gentle nudge when your streak is at risk. Saved to your account; reminders aren't being sent yet."
        value={profile.notifyReminders}
        disabled={busy}
        onChange={(v) => void save({ notify_reminders: v })}
      />
      <Toggle
        icon={theme === 'dark' ? <MoonIcon size={14} /> : <SunIcon size={14} />}
        label="Theme"
        hint="Switch between light and dark mode, applied everywhere: dashboard, catalogue, and quizzes."
        value={theme === 'dark'}
        onChange={(v) => setTheme(v ? 'dark' : 'light')}
      />
      {error && <Notice kind="error">{error}</Notice>}
    </Card>
  );
}

export function AccountCard({
  email,
  signingOut,
  onLogout,
  onDelete,
  deleteUnavailableReason,
}: {
  email: string;
  signingOut: boolean;
  onLogout: () => void;
  onDelete: (confirmEmail: string) => Promise<void>;
  deleteUnavailableReason?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === email.toLowerCase() && email.length > 0;

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(typed.trim());
      // The page redirects on success; nothing more to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account');
      setDeleting(false);
    }
  }

  return (
    <Card title="Account">
      <button
        type="button"
        onClick={onLogout}
        disabled={signingOut}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 18px',
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--text)',
          background: 'var(--fill)',
          border: '1px solid var(--line2)',
          borderRadius: 10,
          cursor: signingOut ? 'progress' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <LogOutIcon size={14} />
        {signingOut ? 'Signing out…' : 'Log out'}
      </button>

      <div
        style={{
          marginTop: 6,
          paddingTop: 16,
          borderTop: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--error)' }}>Delete account</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}>
            Permanently removes your account, progress, XP, bookmarks and notes. This can&apos;t be
            undone.
          </div>
        </div>

        {deleteUnavailableReason ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>{deleteUnavailableReason}</p>
        ) : !confirming ? (
          <PrimaryButton tone="danger" onClick={() => setConfirming(true)}>
            Delete my account…
          </PrimaryButton>
        ) : (
          <>
            <Field
              label={`Type ${email} to confirm`}
              value={typed}
              onChange={setTyped}
              autoComplete="off"
              placeholder={email}
            />
            {error && <Notice kind="error">{error}</Notice>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <PrimaryButton tone="danger" busy={deleting} disabled={!matches} onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setTyped('');
                  setError(null);
                }}
                disabled={deleting}
                style={{
                  padding: '11px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  color: 'var(--text2)',
                  background: 'transparent',
                  border: '1px solid var(--line2)',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
