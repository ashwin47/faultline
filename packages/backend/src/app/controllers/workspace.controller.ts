import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import { WorkspaceService } from '../services/workspace.service';
import { Account } from '../models/account.model';
import { logger } from '../../lib/utils/logger';

const router: ExpressRouter = Router({ mergeParams: true });

/**
 * Middleware: verify the authenticated user is a member of the account in the URL.
 */
function verifyAccountMembership(req: Request, res: Response, next: () => void): void {
  const { accountId } = req.params;
  const userId = req.user!.userId;

  const role = Account.getMemberRole(accountId, userId);
  if (!role) {
    res.status(403).json({ error: 'You are not a member of this workspace' });
    return;
  }

  next();
}

router.use(verifyAccountMembership);

/**
 * PUT /api/accounts/:accountId/rename
 */
router.put('/rename', (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const result = WorkspaceService.rename(req.params.accountId, req.user!.userId, name);
    res.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Workspace rename error');
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/accounts/:accountId/invites
 */
router.post('/invites', async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      res.status(400).json({ error: 'Email and role are required' });
      return;
    }

    const result = await WorkspaceService.inviteMember(
      req.params.accountId,
      req.user!.userId,
      email,
      role,
    );
    res.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Workspace invite error');
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/accounts/:accountId/members
 */
router.get('/members', (req: Request, res: Response) => {
  try {
    const members = WorkspaceService.listMembers(req.params.accountId);
    const pendingInvites = WorkspaceService.listPendingInvites(req.params.accountId);
    res.json({ members, pendingInvites });
  } catch (error: any) {
    logger.error({ error: error.message }, 'List members error');
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/accounts/:accountId/members/:userId
 */
router.delete('/members/:userId', (req: Request, res: Response) => {
  try {
    WorkspaceService.removeMember(req.params.accountId, req.user!.userId, req.params.userId);
    res.json({ message: 'Member removed' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Remove member error');
    res.status(400).json({ error: error.message });
  }
});

/**
 * PATCH /api/accounts/:accountId/members/:userId/role
 */
router.patch('/members/:userId/role', (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!role) {
      res.status(400).json({ error: 'Role is required' });
      return;
    }

    WorkspaceService.updateMemberRole(
      req.params.accountId,
      req.user!.userId,
      req.params.userId,
      role,
    );
    res.json({ message: 'Role updated' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Update role error');
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/accounts/:accountId/invites/:inviteId
 */
router.delete('/invites/:inviteId', (req: Request, res: Response) => {
  try {
    WorkspaceService.cancelInvite(req.params.accountId, req.user!.userId, req.params.inviteId);
    res.json({ message: 'Invite cancelled' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Cancel invite error');
    res.status(400).json({ error: error.message });
  }
});

export default router;
