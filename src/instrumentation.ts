/**
 * Next.js instrumentation hook.
 * Runs once when the server starts. Used to initialize the
 * in-process cron scheduler.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('./lib/scheduler');
    initScheduler();
  }
}
