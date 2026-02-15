export interface JwtPayload {
  sub: string; // userId
  sessionId: string;
  accountId: string;
  email: string;
  role: string;
}

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  accountId: string;
  role: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
