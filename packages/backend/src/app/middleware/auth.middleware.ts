import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment';
import { Session } from '../models/session.model';
import type { JwtPayload, AuthenticatedUser } from '../../types/auth';

// Throttle lastActiveAt updates to once per minute per session
const lastActiveCache = new Map<string, number>();
const LAST_ACTIVE_THROTTLE_MS = 60_000;

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Validate the session still exists in the DB
    const session = Session.findById(payload.sessionId);
    if (!session) {
      res.status(401).json({ error: 'Session revoked' });
      return;
    }

    // Throttled lastActiveAt update
    const now = Date.now();
    const lastUpdate = lastActiveCache.get(payload.sessionId) || 0;
    if (now - lastUpdate > LAST_ACTIVE_THROTTLE_MS) {
      Session.updateLastActive(payload.sessionId);
      lastActiveCache.set(payload.sessionId, now);
    }

    const user: AuthenticatedUser = {
      userId: payload.sub,
      sessionId: payload.sessionId,
      email: payload.email,
      accountId: payload.accountId,
      role: payload.role,
      name: '',
    };

    req.user = user;

    // Sliding renewal: issue a fresh token on every authenticated request
    const renewed = jwt.sign(
      {
        sub: payload.sub,
        sessionId: payload.sessionId,
        accountId: payload.accountId,
        email: payload.email,
        role: payload.role,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any },
    );
    res.setHeader('X-Renewed-Token', renewed);

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}
