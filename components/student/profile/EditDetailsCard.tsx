'use client';

import { useState } from 'react';
import { MailIcon, UserIcon } from '@/components/icons';
import { ACADEMIC_YEARS, formatAcademicYear } from '@/lib/academic-year';
import { USERNAME_PATTERN, type ProfilePatch } from '@/lib/profile-schema';
import type { StudentProfileDto } from '@/lib/student-profile';
import { Card, Field, Notice, PrimaryButton } from './ui';

/**
 * Name, username and academic year behind a single Save. Only the fields
 * that actually changed are sent: re-sending an unchanged year would
 * re-baseline the September rollover for no reason.
 */
export function EditDetailsCard({
  profile,
  onSave,
}: {
  profile: StudentProfileDto;
  onSave: (patch: ProfilePatch) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [username, setUsername] = useState(profile.username ?? '');
  const [year, setYear] = useState(profile.academicYear != null ? String(profile.academicYear) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const normalisedUsername = username.trim().toLowerCase();
  const usernameError =
    normalisedUsername && !USERNAME_PATTERN.test(normalisedUsername)
      ? 'Use 3–20 letters, numbers or underscores'
      : null;

  const patch: ProfilePatch = {};
  if (fullName.trim() !== profile.fullName) patch.full_name = fullName.trim();
  if (normalisedUsername && normalisedUsername !== (profile.username ?? '')) {
    patch.username = normalisedUsername;
  }
  if (year && Number(year) !== profile.academicYear) patch.academic_year = Number(year);

  const dirty = Object.keys(patch).length > 0;
  const nameMissing = fullName.trim().length === 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || usernameError || nameMissing) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(patch);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} noValidate>
      <Card title="Profile details">
        <Field
          icon={<UserIcon size={14} />}
          label="Full name"
          value={fullName}
          onChange={(v) => {
            setFullName(v);
            setSaved(false);
          }}
          placeholder="Your name"
          autoComplete="name"
          maxLength={80}
          error={nameMissing ? 'Name is required' : null}
        />
        <Field
          icon={<UserIcon size={14} />}
          label="Username"
          value={username}
          onChange={(v) => {
            setUsername(v);
            setSaved(false);
          }}
          placeholder="choose_a_username"
          autoComplete="username"
          maxLength={20}
          prefix="@"
          error={usernameError}
          hint="Shown on the leaderboard. 3–20 letters, numbers or underscores."
        />
        <Field
          icon={<MailIcon size={14} />}
          label="Email"
          value={profile.email}
          onChange={() => {}}
          type="email"
          disabled
          hint="Contact support to change the email tied to your account."
        />

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>Academic year</span>
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setSaved(false);
            }}
            style={{
              padding: '11px 14px',
              borderRadius: 10,
              border: '1px solid var(--line2)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          >
            {profile.academicYear == null && (
              <option value="" disabled>
                Select your year
              </option>
            )}
            {ACADEMIC_YEARS.map((y) => (
              <option key={y} value={y}>
                {formatAcademicYear(y)}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            Moves up automatically every September. Change it here if you&apos;re repeating a year
            or picked the wrong one.
          </span>
        </label>

        {error && <Notice kind="error">{error}</Notice>}
        {saved && !dirty && <Notice kind="success">Saved.</Notice>}

        <PrimaryButton
          type="submit"
          busy={saving}
          disabled={!dirty || !!usernameError || nameMissing}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </PrimaryButton>
      </Card>
    </form>
  );
}
