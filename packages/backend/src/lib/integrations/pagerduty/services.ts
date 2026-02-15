import { z } from 'zod';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { pdPaginate } from './client';

// ── pd_list_services ─────────────────────────────────────────────────

export const pdListServices: ToolDefinition = {
  name: 'pd_list_services',
  description:
    'List PagerDuty services. Optionally filter by name substring. Returns id, name, status, escalation policy, and description.',
  category: 'pagerduty',
  parameters: z.object({
    query: z.string().optional().describe('Filter by name (substring match)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const params: Record<string, any> = {};
    if (args.query) params['query'] = args.query;

    const services = await pdPaginate<any>(ctx.accountId!, '/services', 'services', params);

    const slim = services.map((s: any) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      description: s.description,
      escalation_policy: s.escalation_policy?.summary,
      html_url: s.html_url,
    }));

    return {
      title: `PagerDuty Services (${slim.length})`,
      output: JSON.stringify({ count: slim.length, services: slim }, null, 2),
    };
  },
};

// ── pd_list_escalation_policies ──────────────────────────────────────

export const pdListEscalationPolicies: ToolDefinition = {
  name: 'pd_list_escalation_policies',
  description:
    'List PagerDuty escalation policies with their rules and targets. Useful for understanding who gets paged and in what order.',
  category: 'pagerduty',
  parameters: z.object({
    query: z.string().optional().describe('Filter by name (substring match)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const params: Record<string, any> = {};
    if (args.query) params['query'] = args.query;

    const policies = await pdPaginate<any>(
      ctx.accountId!,
      '/escalation_policies',
      'escalation_policies',
      params,
    );

    const slim = policies.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      num_loops: p.num_loops,
      rules: p.escalation_rules?.map((r: any) => ({
        escalation_delay_in_minutes: r.escalation_delay_in_minutes,
        targets: r.targets?.map((t: any) => ({
          type: t.type,
          name: t.summary,
        })),
      })),
      html_url: p.html_url,
    }));

    return {
      title: `Escalation Policies (${slim.length})`,
      output: JSON.stringify({ count: slim.length, escalation_policies: slim }, null, 2),
    };
  },
};
