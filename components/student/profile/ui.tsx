'use client';

import type { CSSProperties, ReactNode } from 'react';
import { SpinnerIcon } from '@/components/icons';

/**
 * Shared building blocks for the student profile page. Same look as the
 * original page (inline styles on the --surface/--line/--accent-text
 * tokens scoped by [data-mz-root]) — extracted so each card can live in
 * its own file.
 */

export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        marginTop: 22,
        padding: 22,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 16,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.14em',
          color: 'var(--accent-text)',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      {description && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
        {children}
      </div>
    </section>
  );
}

const inputStyle = (disabled?: boolean, invalid?: boolean): CSSProperties => ({
  padding: '11px 14px',
  borderRadius: 10,
  border: `1px solid ${invalid ? 'var(--error)' : 'var(--line2)'}`,
  background: disabled ? 'var(--fill)' : 'var(--bg)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
});

export function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  hint,
  error,
  autoComplete,
  maxLength,
  prefix,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: string;
  error?: string | null;
  autoComplete?: string;
  maxLength?: number;
  /** Text shown inside the input's left edge, e.g. "@". */
  prefix?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {icon} {label}
      </span>
      <span style={{ position: 'relative', display: 'block' }}>
        {prefix && (
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
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          style={{ ...inputStyle(disabled, !!error), paddingLeft: prefix ? 30 : 14 }}
        />
      </span>
      {error ? (
        <span role="alert" style={{ fontSize: 11, color: 'var(--error)' }}>
          {error}
        </span>
      ) : (
        hint && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{hint}</span>
      )}
    </label>
  );
}

export function Toggle({
  icon,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {icon} {label}
        </div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        style={{
          position: 'relative',
          flex: 'none',
          width: 44,
          height: 24,
          borderRadius: 999,
          border: 'none',
          background: value ? 'var(--accent-text)' : 'var(--line2)',
          cursor: disabled ? 'progress' : 'pointer',
          opacity: disabled ? 0.6 : 1,
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
            // White stays literal: this switch knob must read clearly
            // against both the solid accent (on) and the line2 fill
            // (off) tracks in both themes.
            background: '#F7F9FA',
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  );
}

export function PrimaryButton({
  children,
  busy,
  disabled,
  type = 'button',
  onClick,
  tone = 'accent',
}: {
  children: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  tone?: 'accent' | 'danger';
}) {
  const danger = tone === 'danger';
  const inactive = disabled || busy;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={inactive}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        padding: '11px 18px',
        fontSize: 13,
        fontWeight: 700,
        fontFamily: 'inherit',
        borderRadius: 10,
        cursor: busy ? 'progress' : inactive ? 'not-allowed' : 'pointer',
        opacity: disabled && !busy ? 0.55 : 1,
        // White stays literal on the solid accent fill in both themes.
        color: danger ? 'var(--error)' : '#F7F9FA',
        background: danger ? 'rgb(var(--error-rgb) / 0.08)' : 'var(--accent-text)',
        border: danger ? '1px solid rgb(var(--error-rgb) / 0.35)' : '1px solid transparent',
      }}
    >
      {busy && <SpinnerIcon size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Notice({
  kind,
  children,
}: {
  kind: 'success' | 'error';
  children: ReactNode;
}) {
  const color = kind === 'success' ? 'var(--success)' : 'var(--error)';
  const rgb = kind === 'success' ? 'var(--success-rgb)' : 'var(--error-rgb)';
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      style={{
        margin: 0,
        padding: '9px 12px',
        fontSize: 12,
        color,
        background: `rgb(${rgb} / 0.08)`,
        border: `1px solid rgb(${rgb} / 0.3)`,
        borderRadius: 10,
      }}
    >
      {children}
    </p>
  );
}
