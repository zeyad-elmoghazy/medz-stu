import { Client } from '@upstash/qstash';

const token = process.env.QSTASH_TOKEN;

/**
 * QStash client.
 *
 * In production, QSTASH_TOKEN must be set. When it's missing
 * (local dev / demo bundle), we export `null` and `enqueue()`
 * surfaces an explicit error — heavy ops should NOT silently
 * run inline just because the queue isn't configured, because
 * that would re-introduce the very latency / timeout problem
 * the queue exists to solve. The professor dashboard checks
 * `isDemoMode()` and short-circuits before reaching this path.
 */
export const qstash = token ? new Client({ token }) : null;

/**
 * Public base URL of this app. QStash needs a publicly reachable
 * URL to deliver messages to. In local dev with a real QStash
 * token, expose the dev server with `ngrok` (or similar) and set
 * NEXT_PUBLIC_APP_URL to the tunnel URL.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export const QUEUE_URLS = {
  generateQuestions: `${APP_URL}/api/jobs/generate-questions`,
  recalcAnalytics: `${APP_URL}/api/jobs/recalc-analytics`,
  exportData: `${APP_URL}/api/jobs/export-data`,
};

/**
 * Publish a job to QStash.
 *
 * Returns the QStash messageId. Persist this as the `jobs.id`
 * row so the polling endpoint and worker reference the same key.
 *
 * `delaySeconds` defers delivery (useful for retries / debouncing).
 * `retries: 3` means QStash will redeliver up to 3 times on a
 * non-2xx response before declaring the message failed.
 */
export async function enqueue(
  url: string,
  payload: object,
  delaySeconds = 0
): Promise<{ messageId: string }> {
  if (!qstash) {
    throw new Error(
      'QSTASH_TOKEN is not configured. Set it in .env.local or skip the queue path (e.g. demo mode).'
    );
  }

  if (!APP_URL) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is not configured. QStash needs a publicly reachable URL to deliver jobs to.'
    );
  }

  const result = await qstash.publishJSON({
    url,
    body: payload,
    delay: delaySeconds,
    retries: 3,
  });

  return { messageId: result.messageId };
}
