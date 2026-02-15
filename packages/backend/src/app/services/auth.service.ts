import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/environment';
import { User } from '../models/user.model';
import { Account } from '../models/account.model';
import { Session } from '../models/session.model';
import { Setting } from '../models/setting.model';
import { EmailService } from './email.service';
import { logger } from '../../lib/utils/logger';
import type { JwtPayload } from '../../types/auth';

const SALT_ROUNDS = 10;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as any,
  });
}

export class AuthService {
  static async signup(email: string, password: string, name: string): Promise<{
    user: { id: string; email: string; name: string };
    autoConfirmed: boolean;
  }> {
    const existing = User.findByEmail(email);
    if (existing) {
      throw new Error('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = uuidv4();
    const autoConfirm = !EmailService.isConfigured();

    let verificationToken: string | undefined;
    let verificationExpiry: Date | undefined;

    if (!autoConfirm) {
      verificationToken = crypto.randomBytes(32).toString('hex');
      verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    }

    const user = User.create({
      id: userId,
      email,
      passwordHash,
      name,
      emailVerified: autoConfirm,
      emailVerificationToken: verificationToken,
      emailVerificationExpiresAt: verificationExpiry,
    });

    // Create default account
    const accountId = uuidv4();
    const baseSlug = slugify(`${name}s-workspace`);
    let slug = baseSlug;
    let attempt = 0;
    while (Account.findBySlug(slug)) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    Account.create({ id: accountId, name: `${name}'s Workspace`, slug });
    Account.addMember({ id: uuidv4(), accountId, userId, role: 'owner' });

    // Set user's last active account
    User.update(userId, { lastActiveAccountId: accountId });

    // Seed default account settings
    Setting.set(accountId, 'app.name', 'Faultline');
    Setting.set(accountId, 'app.version', '0.1.0');

    if (!autoConfirm && verificationToken) {
      await EmailService.sendVerificationEmail(email, name, verificationToken);
    }

    logger.info({ userId, email, autoConfirmed: autoConfirm }, 'User signed up');

    return {
      user: { id: user.id, email: user.email, name: user.name },
      autoConfirmed: autoConfirm,
    };
  }

  static async login(email: string, password: string, opts?: {
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    token: string;
    user: { id: string; email: string; name: string };
    account: { id: string; name: string; slug: string };
    role: string;
  }> {
    const user = User.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw new Error('Please verify your email before logging in');
    }

    // Find last active account or first available
    const userAccounts = Account.getUserAccounts(user.id);
    if (userAccounts.length === 0) {
      throw new Error('No workspace found for this user');
    }

    let activeAccount = userAccounts.find((a) => a.id === user.lastActiveAccountId);
    if (!activeAccount) {
      activeAccount = userAccounts[0];
      User.update(user.id, { lastActiveAccountId: activeAccount.id });
    }

    const role = activeAccount.role;

    // Create a session
    const sessionId = uuidv4();
    Session.create({
      id: sessionId,
      userId: user.id,
      ipAddress: opts?.ipAddress,
      userAgent: opts?.userAgent,
    });

    const token = generateToken({
      sub: user.id,
      sessionId,
      accountId: activeAccount.id,
      email: user.email,
      role,
    });

    logger.info({ userId: user.id, accountId: activeAccount.id, sessionId }, 'User logged in');

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name },
      account: { id: activeAccount.id, name: activeAccount.name, slug: activeAccount.slug },
      role,
    };
  }

  static verifyEmail(token: string): void {
    const user = User.findByVerificationToken(token);
    if (!user) {
      throw new Error('Invalid verification token');
    }

    if (user.emailVerificationExpiresAt && new Date() > user.emailVerificationExpiresAt) {
      throw new Error('Verification token has expired');
    }

    User.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    });

    logger.info({ userId: user.id }, 'Email verified');
  }

  static switchAccount(userId: string, accountId: string, opts?: {
    ipAddress?: string;
    userAgent?: string;
  }): {
    token: string;
    account: { id: string; name: string; slug: string };
    role: string;
  } {
    const role = Account.getMemberRole(accountId, userId);
    if (!role) {
      throw new Error('You are not a member of this workspace');
    }

    const account = Account.findById(accountId);
    if (!account) {
      throw new Error('Workspace not found');
    }

    const user = User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    User.update(userId, { lastActiveAccountId: accountId });

    // Create a new session for the switched account context
    const sessionId = uuidv4();
    Session.create({
      id: sessionId,
      userId,
      ipAddress: opts?.ipAddress,
      userAgent: opts?.userAgent,
    });

    const token = generateToken({
      sub: userId,
      sessionId,
      accountId,
      email: user.email,
      role,
    });

    return {
      token,
      account: { id: account.id, name: account.name, slug: account.slug },
      role,
    };
  }

  static getUserAccounts(userId: string): Array<{ id: string; name: string; slug: string; role: string }> {
    return Account.getUserAccounts(userId).map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      role: a.role,
    }));
  }

  static async resendVerification(email: string): Promise<void> {
    const user = User.findByEmail(email);
    if (!user) {
      return;
    }

    if (user.emailVerified) {
      return;
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    User.update(user.id, {
      emailVerificationToken: verificationToken,
      emailVerificationExpiresAt: verificationExpiry,
    });

    await EmailService.sendVerificationEmail(email, user.name, verificationToken);
  }

  static verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  }

  static getSessions(userId: string) {
    return Session.findByUserId(userId);
  }

  static revokeSession(sessionId: string): void {
    Session.delete(sessionId);
  }

  static revokeAllSessions(userId: string): void {
    Session.deleteAllForUser(userId);
  }
}
