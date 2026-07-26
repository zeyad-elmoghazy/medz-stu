'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bold, Italic, List, NotebookPen, Save, X } from 'lucide-react';

/**
 * Heavier notes editor with a tiny formatting toolbar. Pulled out
 * of the quiz page so it can be dynamic-imported — the editor's
 * UI deps (icons + framer motion + autosave logic) aren't paid
 * for on the initial quiz load, only when a user opens the panel.
 */
export default function NotesEditor({
  topic,
  initialValue,
  onChange,
  onClose,
}: {
  topic: string;
  initialValue: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  const [savedTick, setSavedTick] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => setDraft(initialValue), [initialValue]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function handleChange(value: string) {
    setDraft(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onChange(value);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1400);
    }, 350);
  }

  function wrapSelection(prefix: string, suffix: string = prefix) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = draft.slice(0, start);
    const middle = draft.slice(start, end);
    const after = draft.slice(end);
    const next = `${before}${prefix}${middle}${suffix}${after}`;
    handleChange(next);
    queueMicrotask(() => {
      el.focus();
      el.selectionStart = start + prefix.length;
      el.selectionEnd = end + prefix.length;
    });
  }

  function insertBullet() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const before = draft.slice(0, start);
    const after = draft.slice(start);
    const needsNewline = before.length > 0 && !before.endsWith('\n');
    const insert = `${needsNewline ? '\n' : ''}- `;
    const next = `${before}${insert}${after}`;
    handleChange(next);
    queueMicrotask(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + insert.length;
    });
  }

  return (
    <motion.aside
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 280, damping: 32 }}
      className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col"
      style={{
        backgroundColor: '#0F0F1A',
        borderLeft: '1px solid #1E1E2E',
        boxShadow: '-30px 0 60px rgba(0,0,0,0.5)',
      }}
    >
      <header
        className="flex items-center justify-between p-5"
        style={{ borderBottom: '1px solid #1E1E2E' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-500/15 text-violet-200">
            <NotebookPen className="h-4 w-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Your notes
            </span>
            <span className="text-sm font-semibold text-white">{topic}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notes"
          className="grid h-9 w-9 place-items-center rounded-lg text-text-muted transition hover:text-white"
          style={{ border: '1px solid #1E1E2E', backgroundColor: '#0A0A12' }}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Mini toolbar */}
      <div className="flex items-center gap-1.5 px-5 pt-3">
        <ToolbarButton
          icon={<Bold className="h-3.5 w-3.5" />}
          label="Bold"
          onClick={() => wrapSelection('**')}
        />
        <ToolbarButton
          icon={<Italic className="h-3.5 w-3.5" />}
          label="Italic"
          onClick={() => wrapSelection('*')}
        />
        <ToolbarButton
          icon={<List className="h-3.5 w-3.5" />}
          label="Bullet"
          onClick={insertBullet}
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Mnemonics, slide cues, links to lecture clips…"
          className="flex-1 w-full resize-none rounded-xl p-4 text-sm leading-relaxed text-white placeholder:text-text-muted/60 focus:outline-none scrollbar-thin"
          style={{ backgroundColor: '#0A0A12', border: '1px solid #1E1E2E' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#7C3AED')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#1E1E2E')}
        />

        <div className="flex items-center justify-between text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {savedTick ? (
              <span className="text-emerald-300">Saved</span>
            ) : (
              <span>Auto-save on</span>
            )}
          </span>
          <span>{draft.length} chars · markdown</span>
        </div>
      </div>
    </motion.aside>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition hover:text-white"
      style={{ border: '1px solid #1E1E2E', backgroundColor: '#0A0A12' }}
    >
      {icon}
    </button>
  );
}
