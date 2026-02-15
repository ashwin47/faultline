import { registerPagerDutyTools } from '../../lib/integrations/pagerduty/index';
import { registerNewRelicTools } from '../../lib/integrations/newrelic/index';
import { logger } from '../../lib/utils/logger';

/**
 * Register all custom tool integrations.
 * Called once during boot for both API server and worker.
 *
 * Note: AWS is now handled by the AWS API MCP server, not custom tools.
 */
export function initializeTools(): void {
  registerPagerDutyTools();
  logger.info('PagerDuty tools registered');

  registerNewRelicTools();
  logger.info('New Relic tools registered');
}
