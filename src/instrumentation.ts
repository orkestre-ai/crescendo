/**
 * Next.js instrumentation hook.
 * Runs once when the server starts. Used to initialize the
 * in-process cron scheduler and to mark report runs a restart
 * left behind as stopped.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('./lib/scheduler');
    initScheduler();

    // A report runs inside the server's process, so a run still marked as
    // active at start has nobody driving it. A failure here must not stop
    // the server from starting.
    try {
      const { stopInterruptedRuns } = await import('./lib/reports/runner');
      await stopInterruptedRuns();
    } catch (err) {
      const { rootLogger } = await import('./lib/logging');
      rootLogger.error(
        { err, event: 'report.restart.failed' },
        'Could not mark interrupted report runs as stopped'
      );
    }
  }
}
