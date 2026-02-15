import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import { AuthService } from '../services/auth.service';
import { WorkspaceService } from '../services/workspace.service';
import { User } from '../models/user.model';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../../lib/utils/logger';

const router: ExpressRouter = Router();

/**
 * POST /api/auth/signup
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const result = await AuthService.signup(email, password, name);

    if (result.autoConfirmed) {
      res.json({ message: 'Account created successfully. You can now log in.', autoConfirmed: true });
    } else {
      res.json({ message: 'Account created. Please check your email to verify your account.', autoConfirmed: false });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Signup error');
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await AuthService.login(email, password, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Login error');
    res.status(401).json({ error: error.message });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  try {
    AuthService.revokeSession(req.user!.sessionId);
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Logout error');
    res.status(500).json({ error: 'Failed to log out' });
  }
});

/**
 * GET /api/auth/verify-email?token=xxx
 */
router.get('/verify-email', (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Verification token is required' });
      return;
    }

    AuthService.verifyEmail(token);
    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Email verification error');
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = User.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const accounts = AuthService.getUserAccounts(user.id);
    const currentAccount = accounts.find((a) => a.id === req.user!.accountId);
    const pendingInvites = WorkspaceService.getPendingInvitesForUser(user.email);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      account: currentAccount || accounts[0],
      accounts,
      pendingInvites,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Get me error');
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

/**
 * POST /api/auth/switch-account
 */
router.post('/switch-account', authMiddleware, (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      res.status(400).json({ error: 'Account ID is required' });
      return;
    }

    const result = AuthService.switchAccount(req.user!.userId, accountId, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Switch account error');
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/resend-verification
 */
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    await AuthService.resendVerification(email);
    res.json({ message: 'If an account exists with this email, a verification email has been sent.' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Resend verification error');
    res.json({ message: 'If an account exists with this email, a verification email has been sent.' });
  }
});

/**
 * GET /api/auth/sessions — list active sessions for the current user
 */
router.get('/sessions', authMiddleware, (req: Request, res: Response) => {
  try {
    const sessions = AuthService.getSessions(req.user!.userId);
    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        current: s.id === req.user!.sessionId,
      })),
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'List sessions error');
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * DELETE /api/auth/sessions/:id — revoke a specific session
 */
router.delete('/sessions/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify the session belongs to this user
    const sessions = AuthService.getSessions(req.user!.userId);
    const session = sessions.find((s) => s.id === id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    AuthService.revokeSession(id);
    res.json({ message: 'Session revoked' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Revoke session error');
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

export default router;
