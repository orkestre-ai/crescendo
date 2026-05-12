/**
 * Public surface for the job system.
 *
 * During the jobs.ts split (docs/superpowers/plans/2026-04-17-jobs-ts-split.md)
 * this file re-exports from the old module. Once extraction is complete,
 * the old src/lib/jobs.ts is deleted and this file exports directly from
 * ./job-processor.
 */

export { jobProcessor, JobProcessor } from './job-processor';
