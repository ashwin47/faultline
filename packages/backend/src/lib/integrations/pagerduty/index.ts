/**
 * PagerDuty custom tools — replaces the PagerDuty hosted MCP server
 * (which has a broken list_alerts_from_incident call) with direct REST API v2 tools.
 */
import { Setting } from '../../../app/models/setting.model';
import { toolRegistry } from '../tool-registry';

// Import all tool definitions
import { pdListIncidents, pdGetIncident, pdListIncidentAlerts, pdListIncidentLogEntries } from './incidents';
import { pdListServices, pdListEscalationPolicies } from './services';
import { pdListOncalls } from './oncalls';

export interface PagerDutyCredentials {
  apiKey: string;
}

/**
 * Read PagerDuty API key from the settings database.
 * Uses indexed key format (pagerduty.N.field). Defaults to instance 0.
 * Throws if not configured.
 */
export function getPagerDutyCredentials(accountId: string, index = 0): PagerDutyCredentials {
  const apiKey = Setting.get(accountId, `pagerduty.${index}.api_key`);

  if (!apiKey) {
    throw new Error('PagerDuty API key not configured. Please enter your API key in Settings.');
  }

  return { apiKey };
}

/** All PagerDuty tool definitions */
const pagerdutyTools = [
  pdListIncidents,
  pdGetIncident,
  pdListIncidentAlerts,
  pdListIncidentLogEntries,
  pdListServices,
  pdListEscalationPolicies,
  pdListOncalls,
];

/**
 * Register all PagerDuty tools with the tool registry.
 * Call this once at startup.
 */
export function registerPagerDutyTools(): void {
  for (const tool of pagerdutyTools) {
    toolRegistry.define(tool);
  }
}

/** Names of all PagerDuty tools (for filtering in OpenAIAgent) */
export const pagerdutyToolNames = pagerdutyTools.map(t => t.name);
