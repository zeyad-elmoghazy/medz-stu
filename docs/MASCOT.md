# Bueno in the student app

Bueno is MediZee's skeleton mascot. This branch brings him into the logged-in experience:
quiz reactions, a daily greeting, streak celebrations (with a real streak rescue), a
peace-sign goodbye, and a proud Bueno on the Progress page. This note explains the rules
and where things live. The landing page's Bueno is separate and untouched.

## Moments

| Moment | Where | Rule |
|---|---|---|
| Quiz reaction | both results pages | by the **displayed rounded** accuracy: 100 flex+crown+confetti, 90+ flex, 75+ thumbs up, 50+ straight face "You can do better.", below 50 arms crossed "Go Study." Plus "Up X%" vs. the last attempt in the chapter. |
| Streak celebration | results pages, before the reaction | first quiz of the day (streak grew or started) **or** a rescue. Milestones 3/7/14/30 get a party hat, 100 a graduation cap. Shown once (`streakSeen` is stored with the result). |
| Daily greeting | student layout (`MascotHost`) | once per day per device, by server date. Welcome, streak-alive, rescue, fresh-start; a quiet peace card if the student already practised. One extra "streak at risk" nudge from 19:00 local if the streak still needs today's quiz. Never on quiz or results routes; steps aside while any `role="dialog"` is open. |
| Peace-sign goodbye | after Save & Exit, and on `/login` after sign-out | a one-slot note in `sessionStorage` (`bueno:event`, 2-minute expiry). |
| Proud Bueno | top of the Progress view | picked from real numbers: 7+ day streak, rising accuracy, high accuracy, volume milestone, else steady. |

## The streak rescue (new rule, not a UI trick)

A streak day is a day with `daily_streaks.challenges_completed > 0` (the SQL function
`get_student_streak`). If a student missed **exactly yesterday** after a streak of **2+ days**,
answering **100 questions today** (summed over today's completed `quiz_sessions`, chapter
quizzes and custom exams) backfills yesterday's row, so the old streak is genuinely restored.
Two or more missed days: gone. It is idempotent and needs no migration. The write happens in
`applyStreakRescueIfEarned` (`lib/server/streak-status.ts`), called by both submit routes.

"Today" is the server's calendar day, exactly as `record_quiz_result` computes it (UTC on Vercel).

## Motion

Every appearance plays the same choreography (`components/mascot/Bueno.tsx`, `lib/mascot/poses.ts`):
pop in standing in the **original pose**, crouch, hop, cross-fade into the pose mid-air, land,
idle. The old waving-arm layer **never moves** on the way into a pose; only `pose="rest"` waves
(the greeting hello). **His width-to-height ratio never changes**, at any moment or screen size:
every scale in the choreography and the idle loops is a single uniform number (no squash or
sideways stretch), his box keeps the artwork's 800:1100 ratio and is never flex-shrunk, and the
artwork is `object-fit: contain`. A unit test fails if any mascot file scales one axis alone. `prefers-reduced-motion` gets the finished
pose after a short fade, with no travel, loops or confetti.

## Files

- Logic (pure, unit-tested): `lib/streak-date.ts`, `lib/streak-state.ts`, `lib/mascot/*`
- Server: `lib/server/streak-status.ts`, `GET /api/student/mascot/status`, and the additive
  `streak` / `previousAccuracy` fields on `POST .../chapters/[id]/submit` and
  `POST .../custom-exam/[id]/submit` (null on any failure; a quiz submit never depends on Bueno)
- UI: `components/mascot/*`, wired in the student layout, both results pages, the dashboard's
  Analytics view, both quiz pages (Save & Exit), the navbar (sign-out) and the login page

## Art

`public/mascot/bueno-{body,head}.webp` and `bueno-arm-sym.webp` are the original pose (the arm
layer gets a mirrored copy of the left hand so both hands match). `bueno-body.webp`,
`bueno-head.webp` and the old `bueno-arm.webp` are byte-identical to `feat/landing-redesign`,
so the two branches never conflict. `public/mascot/poses/*.webp` are eight AI-generated poses
cut out onto the same 800x1100 canvas; skull anchors for hats/crown are in `poses.ts`.

## Testing

- `npm test` runs everything; the integration tests (`__tests__/integration/mascot-streak.test.ts`
  and the custom-exam suite) need a **local** Supabase and skip themselves otherwise.
- Browser behaviour (greeting states, celebration, tiers, mobile, light/dark, reduced motion)
  was checked against a throwaway local stack with seeded students, never production.
