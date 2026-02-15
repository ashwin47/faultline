import { z } from 'zod';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { pdRequest, pdPaginate } from './client';

// ── pd_list_incidents ────────────────────────────────────────────────

export const pdListIncidents: ToolDefinition = {
  name: 'pd_list_incidents',
  description:
    'List PagerDuty incidents. Filter by status, urgency, service, or time range. Returns id, title, status, urgency, service name, created/resolved timestamps, and assignment.',
  category: 'pagerduty',
  parameters: z.object({
    statuses: z
      .array(z.enum(['triggered', 'acknowledged', 'resolved']))
      .optional()
      .describe('Filter by statuses (default: triggered, acknowledged)'),
    urgencies: z
      .array(z.enum(['high', 'low']))
      .optional()
      .describe('Filter by urgency'),
    since: z.string().optional().describe('Start of time range (ISO 8601)'),
    until: z.string().optional().describe('End of time range (ISO 8601)'),
    service_ids: z
      .array(z.string())
      .optional()
      .describe('Filter by service IDs'),
    sort_by: z
      .string()
      .optional()
      .describe('Sort field (e.g. "created_at", "resolved_at:desc")'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const params: Record<string, any> = {};
    if (args.statuses) params['statuses'] = args.statuses;
    if (args.urgencies) params['urgencies'] = args.urgencies;
    if (args.since) params['since'] = args.since;
    if (args.until) params['until'] = args.until;
    if (args.service_ids) params['service_ids'] = args.service_ids;
    if (args.sort_by) params['sort_by'] = args.sort_by;

    const incidents = await pdPaginate<any>(ctx.accountId!, '/incidents', 'incidents', params);

    const slim = incidents.map((i: any) => ({
      id: i.id,
      incident_number: i.incident_number,
      title: i.title,
      status: i.status,
      urgency: i.urgency,
      service: i.service?.summary,
      created_at: i.created_at,
      resolved_at: i.resolved_at,
      assigned_to: i.assignments?.map((a: any) => a.assignee?.summary),
      html_url: i.html_url,
    }));

    return {
      title: `PagerDuty Incidents (${slim.length})`,
      output: JSON.stringify({ count: slim.length, incidents: slim }, null, 2),
    };
  },
};

// ── pd_get_incident ──────────────────────────────────────────────────

export const pdGetIncident: ToolDefinition = {
  name: 'pd_get_incident',
  description:
    'Get a single PagerDuty incident by ID. Returns full details including description, notes, service, escalation policy, and timeline.',
  category: 'pagerduty',
  parameters: z.object({
    id: z.string().describe('Incident ID (e.g. P1234ABC)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const data = await pdRequest<any>(ctx.accountId!, `/incidents/${args.id}`);
    const i = data.incident;
    return {
      title: `Incident ${i.incident_number}: ${i.title}`,
      output: JSON.stringify(
        {
          id: i.id,
          incident_number: i.incident_number,
          title: i.title,
          status: i.status,
          urgency: i.urgency,
          description: i.description,
          service: i.service?.summary,
          escalation_policy: i.escalation_policy?.summary,
          created_at: i.created_at,
          resolved_at: i.resolved_at,
          last_status_change_at: i.last_status_change_at,
          assigned_to: i.assignments?.map((a: any) => a.assignee?.summary),
          acknowledgements: i.acknowledgements?.map((a: any) => ({
            acknowledger: a.acknowledger?.summary,
            at: a.at,
          })),
          html_url: i.html_url,
        },
        null,
        2,
      ),
    };
  },
};

// ── pd_list_incident_alerts ──────────────────────────────────────────

export const pdListIncidentAlerts: ToolDefinition = {
  name: 'pd_list_incident_alerts',
  description:
    'List alerts for a PagerDuty incident. This is the direct REST replacement for the broken MCP list_alerts_from_incident call. Returns alert details, severity, timestamps, and body.',
  category: 'pagerduty',
  parameters: z.object({
    incident_id: z.string().describe('Incident ID'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const alerts = await pdPaginate<any>(
      ctx.accountId!,
      `/incidents/${args.incident_id}/alerts`,
      'alerts',
    );

    const slim = alerts.map((a: any) => ({
      id: a.id,
      status: a.status,
      severity: a.severity,
      summary: a.summary,
      created_at: a.created_at,
      resolved_at: a.resolved_at,
      service: a.service?.summary,
      body: a.body,
    }));

    return {
      title: `Alerts for incident ${args.incident_id} (${slim.length})`,
      output: JSON.stringify({ count: slim.length, alerts: slim }, null, 2),
    };
  },
};

// ── pd_list_incident_log_entries ─────────────────────────────────────

export const pdListIncidentLogEntries: ToolDefinition = {
  name: 'pd_list_incident_log_entries',
  description:
    'Get the timeline (log entries) for a PagerDuty incident. Shows trigger, acknowledge, escalation, resolve, and note events.',
  category: 'pagerduty',
  parameters: z.object({
    incident_id: z.string().describe('Incident ID'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const entries = await pdPaginate<any>(
      ctx.accountId!,
      `/incidents/${args.incident_id}/log_entries`,
      'log_entries',
      { include: ['channels'] },
    );

    const slim = entries.map((e: any) => ({
      id: e.id,
      type: e.type,
      created_at: e.created_at,
      summary: e.summary,
      agent: e.agent?.summary,
      channel: e.channel,
    }));

    return {
      title: `Log entries for incident ${args.incident_id} (${slim.length})`,
      output: JSON.stringify({ count: slim.length, log_entries: slim }, null, 2),
    };
  },
};
