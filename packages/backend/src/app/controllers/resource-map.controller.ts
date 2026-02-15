import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import { ResourceMapModel } from '../models/resource-map.model';
import { ResourceDiscoveryService } from '../services/resource-discovery.service';
import { logger } from '../../lib/utils/logger';

const router: ExpressRouter = Router({ mergeParams: true });

/**
 * GET /api/accounts/:accountId/resource-maps
 * List all resource maps (summary only)
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const maps = ResourceMapModel.all(accountId);
    res.json({ maps });
  } catch (error) {
    logger.error({ error }, 'Error fetching resource maps');
    res.status(500).json({ error: 'Failed to fetch resource maps' });
  }
});

/**
 * POST /api/accounts/:accountId/resource-maps
 * Create a new resource map
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { name, description } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const map = ResourceMapModel.create(accountId, name, description);
    res.status(201).json(map);
  } catch (error) {
    logger.error({ error }, 'Error creating resource map');
    res.status(500).json({ error: 'Failed to create resource map' });
  }
});

/**
 * GET /api/accounts/:accountId/resource-maps/:id
 * Get a full resource map with nodes and edges
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { id } = req.params;
    const map = ResourceMapModel.find(accountId, id);

    if (!map) {
      res.status(404).json({ error: 'Resource map not found' });
      return;
    }

    res.json(map);
  } catch (error) {
    logger.error({ error }, 'Error fetching resource map');
    res.status(500).json({ error: 'Failed to fetch resource map' });
  }
});

/**
 * PUT /api/accounts/:accountId/resource-maps/:id
 * Update resource map metadata
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { id } = req.params;
    const { name, description } = req.body;

    const existing = ResourceMapModel.find(accountId, id);
    if (!existing) {
      res.status(404).json({ error: 'Resource map not found' });
      return;
    }

    ResourceMapModel.update(accountId, id, { name, description });
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error updating resource map');
    res.status(500).json({ error: 'Failed to update resource map' });
  }
});

/**
 * DELETE /api/accounts/:accountId/resource-maps/:id
 * Delete a resource map
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { id } = req.params;
    ResourceMapModel.destroy(accountId, id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error deleting resource map');
    res.status(500).json({ error: 'Failed to delete resource map' });
  }
});

/**
 * POST /api/accounts/:accountId/resource-maps/:id/sync
 * Trigger resource sync from all configured integrations
 */
router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { id } = req.params;

    const existing = ResourceMapModel.find(accountId, id);
    if (!existing) {
      res.status(404).json({ error: 'Resource map not found' });
      return;
    }

    const discovery = new ResourceDiscoveryService(accountId);
    const discovered = await discovery.syncAll();

    // Merge with existing graph and re-infer all connections
    const merged = discovery.mergeWithExisting(
      existing.nodes,
      existing.edges,
      discovered.nodes,
    );

    ResourceMapModel.saveGraph(accountId, id, merged.nodes, merged.edges);
    ResourceMapModel.updateLastSyncedAt(accountId, id);

    const updated = ResourceMapModel.find(accountId, id);
    res.json(updated);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error syncing resource map');
    res.status(500).json({ error: 'Failed to sync resource map' });
  }
});

/**
 * PUT /api/accounts/:accountId/resource-maps/:id/graph
 * Save graph data (node positions after drag, etc.)
 */
router.put('/:id/graph', (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { id } = req.params;
    const { nodes, edges, groups } = req.body;

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      res.status(400).json({ error: 'nodes and edges arrays are required' });
      return;
    }

    ResourceMapModel.saveGraph(accountId, id, nodes, edges, groups);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error saving graph');
    res.status(500).json({ error: 'Failed to save graph' });
  }
});

export default router;
