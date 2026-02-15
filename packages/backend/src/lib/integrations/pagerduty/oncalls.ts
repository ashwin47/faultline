import { z } from 'zod';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { pdPaginate } from './client';

// ── pd_list_oncalls ──────────────────────────────────────────────────

export const pdListOncalls: ToolDefinition = {
  name: 'pd_list_oncalls',
  description:
    'List who is currently on call. Optionally filter by escalation policy or schedule IDs. Returns user, escalation level, schedule, start/end times.',
  category: 'pagerduty',
  parameters: z.object({
    escalation_policy_ids: z
      .array(z.string())
      .optional()
      .describe('Filter by escalation policy IDs'),
    schedule_ids: z
      .array(z.string())
      .optional()
      .describe('Filter by schedule IDs'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const params: Record<string, any> = {};
    if (args.escalation_policy_ids) params['escalation_policy_ids'] = args.escalation_policy_ids;
    if (args.schedule_ids) params['schedule_ids'] = args.schedule_ids;

    const oncalls = await pdPaginate<any>(ctx.accountId!, '/oncalls', 'oncalls', params);

    const slim = oncalls.map((o: any) => ({
      user: o.user?.summary,
      escalation_level: o.escalation_level,
      escalation_policy: o.escalation_policy?.summary,
      schedule: o.schedule?.summary,
      start: o.start,
      end: o.end,
    }));

    return {
      title: `On-Call (${slim.length})`,
      output: JSON.stringify({ count: slim.length, oncalls: slim }, null, 2),
    };
  },
};
