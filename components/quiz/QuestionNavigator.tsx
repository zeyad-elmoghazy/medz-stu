'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, CloseIcon } from '@/components/icons';
import { isJumpable, type NavStatus } from '@/lib/quiz-navigator';

const STATUS_LABEL: Record<NavStatus, string> = {
  correct: 'answered correctly',
  incorrect: 'answered incorrectly',
  answered: 'answered',
  open: 'next to answer',
  locked: 'locked, answer the earlier questions first',
};

function pillStyle(status: NavStatus): React.CSSProperties {
  switch (status) {
    case 'correct':
      return {
        backgroundColor: 'rgb(var(--success-rgb) / 0.15)',
        color: 'var(--success)',
        border: '1px solid rgb(var(--success-rgb) / 0.45)',
      };
    case 'incorrect':
      return {
        backgroundColor: 'rgb(var(--error-rgb) / 0.15)',
        color: 'var(--error)',
        border: '1px solid rgb(var(--error-rgb) / 0.45)',
      };
    case 'answered':
      return {
        backgroundColor: 'var(--fill)',
        color: 'var(--text)',
        border: '1px solid var(--line2)',
      };
    case 'open':
      return {
        backgroundColor: 'transparent',
        color: 'var(--accent-text)',
        border: '1px dashed var(--accent-text)',
      };
    case 'locked':
      return {
        backgroundColor: 'transparent',
        color: 'var(--text3)',
        border: '1px solid var(--line2)',
        opacity: 0.6,
      };
  }
}

/**
 * "All questions" panel: a numbered grid the student can use to go back to an
 * earlier question mid-quiz. Right-hand drawer on wide screens, bottom sheet
 * on phones. Rendered by the quiz page (not inside the sticky header, whose
 * backdrop-filter would trap `position: fixed` children).
 */
export function QuestionNavigatorPanel({
  open,
  statuses,
  currentIndex,
  answeredCount,
  onJump,
  onClose,
}: {
  open: boolean;
  statuses: NavStatus[];
  currentIndex: number;
  answeredCount: number;
  onJump: (index: number) => void;
  onClose: () => void;
}) {
  const currentRef = useRef<HTMLButtonElement | null>(null);
  // The page passes a fresh onClose every render; keep the effect below keyed
  // on `open` only so it neither refocuses nor re-binds on each page render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    currentRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="question-navigator-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-2xl shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-sm sm:rounded-none sm:rounded-l-2xl"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--line)',
            }}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
              <div>
                <h2 id="question-navigator-title" className="text-base font-bold text-text-primary">
                  All questions
                </h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  {answeredCount} of {statuses.length} answered
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close question list"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-text-muted transition hover:text-text-primary"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3">
              <ul className="grid grid-cols-5 gap-2">
                {statuses.map((status, i) => {
                  const isCurrent = i === currentIndex;
                  return (
                    <li key={i}>
                      <button
                        ref={isCurrent ? currentRef : undefined}
                        type="button"
                        disabled={!isJumpable(status)}
                        onClick={() => onJump(i)}
                        aria-label={`Question ${i + 1}, ${STATUS_LABEL[status]}`}
                        aria-current={isCurrent ? 'true' : undefined}
                        className="relative grid h-11 w-full place-items-center rounded-lg text-sm font-semibold tabular-nums transition enabled:hover:brightness-110 disabled:cursor-not-allowed"
                        style={{
                          ...pillStyle(status),
                          ...(isCurrent
                            ? { outline: '2px solid var(--accent-text)', outlineOffset: '2px' }
                            : null),
                        }}
                      >
                        {i + 1}
                        {status === 'correct' && (
                          <CheckIcon size={10} className="absolute right-1 top-1" aria-hidden />
                        )}
                        {status === 'incorrect' && (
                          <CloseIcon size={10} className="absolute right-1 top-1" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-3 text-[11px] text-text-muted"
              style={{
                borderTop: '1px solid var(--line)',
                paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
              }}
            >
              <LegendItem status="correct" label="Correct" />
              <LegendItem status="incorrect" label="Incorrect" />
              <LegendItem status="open" label="Next" />
              <LegendItem status="locked" label="Locked" />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function LegendItem({ status, label }: { status: NavStatus; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-3 w-3 rounded" style={{ ...pillStyle(status), opacity: 1 }} />
      {label}
    </span>
  );
}
