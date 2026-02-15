import { Express, Request, Response } from 'express';
import authController from './app/controllers/auth.controller';
import agentController from './app/controllers/agent.controller';
import settingsController from './app/controllers/settings.controller';
import workspaceController from './app/controllers/workspace.controller';
import resourceMapController from './app/controllers/resource-map.controller';
import { WorkspaceService } from './app/services/workspace.service';
import { authMiddleware } from './app/middleware/auth.middleware';
import { logger } from './lib/utils/logger';

/**
 * Central route mapping — the Express equivalent of Rails' config/routes.rb.
 *
 * All account-scoped resources live under /api/accounts/:accountId/…
 */
export function registerRoutes(app: Express): void {
  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth routes (public)
  app.use('/api/auth', authController);

  // Account-scoped routes — all protected by authMiddleware
  app.use('/api/accounts/:accountId/agent', authMiddleware, agentController);
  app.use('/api/accounts/:accountId/settings', authMiddleware, settingsController);
  app.use('/api/accounts/:accountId/resource-maps', authMiddleware, resourceMapController);
  app.use('/api/accounts/:accountId', authMiddleware, workspaceController);

  // Accept invite — not account-scoped (user only has a token)
  app.post('/api/invites/accept', authMiddleware, (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) {
        res.status(400).json({ error: 'Token is required' });
        return;
      }

      const result = WorkspaceService.acceptInvite(token, req.user!.userId);
      res.json(result);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Accept invite error');
      res.status(400).json({ error: error.message });
    }
  });
}
