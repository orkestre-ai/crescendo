import { prisma } from '@/lib/db';
import { createAiToolLogger } from '@/lib/logging/journeys';
import type { ToolSkill } from './types';

export const snapshotCompareTool: ToolSkill = {
  schema: {
    name: 'snapshot_compare',
    description:
      'Compare the current page content against a previous content snapshot. Returns a field-by-field diff showing what changed between versions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pageId: {
          type: 'string',
          description: 'The page ID to compare snapshots for',
        },
        snapshotIndex: {
          type: 'number',
          description:
            'Index of the previous snapshot to compare against (0 = most recent previous, 1 = one before that). Defaults to 0.',
        },
      },
      required: ['pageId'],
    },
  },

  instructions: `Use this tool when the user asks about content changes, what was updated recently, or when you need to evaluate whether recent edits improved or hurt alignment with CRO best practices.

The tool returns the current and previous content side-by-side with a field-by-field comparison. Fields compared: metaTitle, appealText, narrativeText.

If no previous snapshot exists, the tool returns an error — inform the user that no content history is available yet.`,

  async execute(params) {
    const toolLog = createAiToolLogger('snapshot_compare');
    const start = Date.now();

    const { pageId, snapshotIndex = 0 } = params as {
      pageId: string;
      snapshotIndex?: number;
    };

    try {
      const snapshots = await prisma.contentSnapshot.findMany({
        where: { pageId },
        orderBy: { capturedAt: 'desc' },
        take: snapshotIndex + 2,
        select: {
          id: true,
          metaTitle: true,
          appealText: true,
          narrativeText: true,
          capturedAt: true,
          enModifiedAt: true,
        },
      });

      if (snapshots.length < 2) {
        toolLog.snapshotCompare(snapshots.length, 0);
        toolLog.executed(pageId, Date.now() - start, 0);
        return {
          data: null,
          summary: 'No previous snapshot available for comparison',
          error: 'Need at least 2 content snapshots to compare. Only found ' + snapshots.length,
        };
      }

      const current = snapshots[0];
      const previous = snapshots[snapshotIndex + 1] || snapshots[snapshots.length - 1];

      const fields = ['metaTitle', 'appealText', 'narrativeText'] as const;
      const changes: Array<{
        field: string;
        before: string | null;
        after: string | null;
        changed: boolean;
      }> = [];

      for (const field of fields) {
        const before = previous[field];
        const after = current[field];
        changes.push({
          field,
          before,
          after,
          changed: before !== after,
        });
      }

      const changedCount = changes.filter((c) => c.changed).length;
      const durationMs = Date.now() - start;
      toolLog.snapshotCompare(snapshots.length, changedCount);
      toolLog.executed(pageId, durationMs, changedCount);

      return {
        data: {
          current: { capturedAt: current.capturedAt, enModifiedAt: current.enModifiedAt },
          previous: { capturedAt: previous.capturedAt, enModifiedAt: previous.enModifiedAt },
          changes,
        },
        summary: `${changedCount} of ${fields.length} fields changed between ${previous.capturedAt.toISOString().split('T')[0]} and ${current.capturedAt.toISOString().split('T')[0]}`,
      };
    } catch (err) {
      toolLog.error(pageId, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
