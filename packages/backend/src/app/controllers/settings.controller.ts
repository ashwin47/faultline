import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import { Setting } from '../models/setting.model';
import { logger } from '../../lib/utils/logger';

const router: ExpressRouter = Router({ mergeParams: true });

/**
 * GET /api/settings
 * Get all settings (with sensitive values masked)
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const settings = Setting.all(accountId, true); // Mask sensitive values
    res.json({ settings });
  } catch (error) {
    logger.error({ error }, 'Error fetching settings');
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/settings
 * Update one or more settings
 */
router.put('/', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'Invalid settings payload' });
      return;
    }

    Setting.setMany(accountId, settings);
    logger.info({ keys: Object.keys(settings) }, 'Settings updated');

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error updating settings');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/settings/status
 * Get integration configuration status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const integrations = Setting.integrationStatus(accountId);
    res.json({ integrations });
  } catch (error) {
    logger.error({ error }, 'Error fetching integration status');
    res.status(500).json({ error: 'Failed to fetch integration status' });
  }
});

/**
 * POST /api/settings/test/:integration
 * Test connection to a specific integration
 */
router.post('/test/:integration', async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { integration } = req.params;

    const validIntegrations = ['openai', 'newrelic', 'sentry', 'aws', 'github', 'pagerduty'];
    if (!validIntegrations.includes(integration)) {
      res.status(400).json({ error: 'Invalid integration name' });
      return;
    }

    const result = await Setting.testIntegration(accountId, integration);
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error testing integration');
    res.status(500).json({ error: 'Failed to test integration' });
  }
});

export default router;
