'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, Sparkles, X } from 'lucide-react';

type Turn = { role: 'user' | 'assistant'; text: string };

/**
 * AITutorPanel — chat panel for asking a tutor model a follow-up
 * question on the current MCQ.
 *
 * Kept in its own file (and dynamic-imported from the quiz page)
 * because the tutor pipeline will eventually pull in a markdown
 * renderer + syntax highlighting + streaming SSE client — none of
 * which belongs in the initial quiz bundle. Today the component
 * still owns its own UI deps (framer-motion, icons) so the
 * dynamic split already shaves measurable bytes.
 */
export default function AITutorPanel({
  questionStem,
  topic,
  onClose,
}: {
  questionStem: string;
  topic: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<Turn[]>([
    {
      role: 'assistant',
      text: `Hi — ask anything about "${topic}". I have the stem in context.`,
    },
  ]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;
    setHistory((h) => [...h, { role: 'user', text }]);
    setDraft('');
    setThinking(true);

    // Placeholder for the real /api/tutor stream — for now we
    // echo back a templated answer after a short delay so the UI
    // can be exercised without burning model tokens.
    await new Promise((r) => setTimeout(r, 900));
    setHistory((h) => [
      ...h,
      {
        role: 'assistant',
        text: `Good question. The discriminating concept here is ${topic.toLowerCase()}; see the right-hand "Explanation" tab for the per-choice breakdown.`,
      },
    ]);
    setThinking(false);
  }

  return (
    <motion.aside
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex h-full flex-col rounded-2xl"
      style={{ backgroundColor: '#0F0F1A', border: '1px solid #1E1E2E' }}
    >
      <header
        className="flex items-center justify-between gap-2 p-4"
        style={{ borderBottom: '1px solid #1E1E2E' }}
      >
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500/15 text-violet-200">
            <Bot className="h-4 w-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
              AI tutor
            </span>
            <span className="text-sm font-semibold text-white">
              Ask about {topic}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tutor"
          className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition hover:text-white"
          style={{ border: '1px solid #1E1E2E', backgroundColor: '#0A0A12' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        <p className="mb-3 rounded-md p-3 text-[11px] italic leading-relaxed text-text-muted"
          style={{ backgroundColor: '#0A0A12', border: '1px solid #1E1E2E' }}
        >
          Stem in context: &ldquo;{questionStem.slice(0, 140)}{questionStem.length > 140 ? '…' : ''}&rdquo;
        </p>

        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {history.map((turn, i) => (
              <motion.li
                key={`${i}-${turn.role}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <span
                  className="max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed"
                  style={
                    turn.role === 'user'
                      ? {
                          backgroundColor: '#7C3AED',
                          color: 'white',
                          boxShadow: '0 0 14px rgba(124,58,237,0.35)',
                        }
                      : {
                          backgroundColor: '#0A0A12',
                          color: '#F8FAFC',
                          border: '1px solid #1E1E2E',
                        }
                  }
                >
                  {turn.text}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {thinking && (
            <li className="flex items-center gap-2 text-xs text-text-muted">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-violet-300" />
              Thinking…
            </li>
          )}
        </ul>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 p-3"
        style={{ borderTop: '1px solid #1E1E2E' }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a follow-up…"
          className="h-10 flex-1 rounded-lg px-3 text-sm text-white placeholder:text-text-muted/60 focus:outline-none"
          style={{ backgroundColor: '#0A0A12', border: '1px solid #1E1E2E' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#7C3AED')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#1E1E2E')}
        />
        <button
          type="submit"
          disabled={!draft.trim() || thinking}
          aria-label="Send"
          className="grid h-10 w-10 place-items-center rounded-lg text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: '#7C3AED',
            boxShadow: '0 0 14px rgba(124,58,237,0.35)',
          }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </motion.aside>
  );
}
