import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../config/database';
import { workspaceInvites, accounts } from '../../db/schema';
import { Account } from '../models/account.model';
import { User } from '../models/user.model';
import { EmailService } from './email.service';
import { logger } from '../../lib/utils/logger';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function requireAdminOrOwner(accountId: string, userId: string): string {
  const role = Account.getMemberRole(accountId, userId);
  if (!role || (role !== 'owner' && role !== 'admin')) {
    throw new Error('You do not have permission to perform this action');
  }
  return role;
}

export class WorkspaceService {
  static rename(accountId: string, userId: string, newName: string): { name: string; slug: string } {
    requireAdminOrOwner(accountId, userId);

    if (!newName || newName.trim().length === 0) {
      throw new Error('Workspace name is required');
    }

    const trimmed = newName.trim();
    const baseSlug = slugify(trimmed);
    let slug = baseSlug;
    let attempt = 0;

    while (true) {
      const existing = Account.findBySlug(slug);
      if (!existing || existing.id === accountId) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    Account.updateName(accountId, trimmed, slug);
    logger.info({ accountId, newName: trimmed, slug }, 'Workspace renamed');
    return { name: trimmed, slug };
  }

  static async inviteMember(
    accountId: string,
    invitedByUserId: string,
    email: string,
    role: string,
  ): Promise<{ id: string; email: string; role: string }> {
    requireAdminOrOwner(accountId, invitedByUserId);

    if (!email || !email.includes('@')) {
      throw new Error('Valid email is required');
    }
    if (role !== 'admin' && role !== 'member') {
      throw new Error('Role must be admin or member');
    }

    const normalizedEmail = email.toLowerCase();

    // Prevent inviting someone who is already a member
    const members = Account.getMembersWithUsers(accountId);
    if (members.some((m) => m.email === normalizedEmail)) {
      throw new Error('This user is already a member of this workspace');
    }

    // Prevent duplicate pending invites
    const db = getDatabase();
    const existing = db
      .select()
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.accountId, accountId),
          eq(workspaceInvites.email, normalizedEmail),
          eq(workspaceInvites.status, 'pending'),
        ),
      )
      .get();

    if (existing) {
      throw new Error('A pending invite already exists for this email');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const id = uuidv4();

    db.insert(workspaceInvites)
      .values({
        id,
        accountId,
        email: normalizedEmail,
        role,
        invitedByUserId,
        token,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdAt: new Date(),
      })
      .run();

    // Send invite email
    const inviter = User.findById(invitedByUserId);
    const account = Account.findById(accountId);
    await EmailService.sendInviteEmail(
      normalizedEmail,
      inviter?.name || 'A teammate',
      account?.name || 'a workspace',
      token,
    );

    logger.info({ accountId, email: normalizedEmail, role }, 'Workspace invite sent');
    return { id, email: normalizedEmail, role };
  }

  static acceptInvite(token: string, userId: string): { accountId: string; accountName: string } {
    const db = getDatabase();
    const invite = db
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.token, token))
      .get();

    if (!invite) {
      throw new Error('Invalid invite token');
    }

    if (invite.status === 'accepted') {
      throw new Error('This invite has already been accepted');
    }

    if (invite.status === 'expired' || new Date() > invite.expiresAt) {
      // Mark as expired if not already
      if (invite.status !== 'expired') {
        db.update(workspaceInvites)
          .set({ status: 'expired' })
          .where(eq(workspaceInvites.id, invite.id))
          .run();
      }
      throw new Error('This invite has expired');
    }

    // Verify the user's email matches the invite
    const user = User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (user.email !== invite.email) {
      throw new Error('This invite was sent to a different email address');
    }

    // Check if already a member
    const existingRole = Account.getMemberRole(invite.accountId, userId);
    if (existingRole) {
      // Mark as accepted anyway
      db.update(workspaceInvites)
        .set({ status: 'accepted' })
        .where(eq(workspaceInvites.id, invite.id))
        .run();
      const account = Account.findById(invite.accountId)!;
      return { accountId: invite.accountId, accountName: account.name };
    }

    // Add as member
    Account.addMember({
      id: uuidv4(),
      accountId: invite.accountId,
      userId,
      role: invite.role,
    });

    // Mark invite as accepted
    db.update(workspaceInvites)
      .set({ status: 'accepted' })
      .where(eq(workspaceInvites.id, invite.id))
      .run();

    const account = Account.findById(invite.accountId)!;
    logger.info({ accountId: invite.accountId, userId }, 'Invite accepted');
    return { accountId: invite.accountId, accountName: account.name };
  }

  static listMembers(accountId: string) {
    return Account.getMembersWithUsers(accountId);
  }

  static listPendingInvites(accountId: string) {
    const db = getDatabase();
    return db
      .select()
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.accountId, accountId),
          eq(workspaceInvites.status, 'pending'),
        ),
      )
      .all()
      .map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      }));
  }

  static removeMember(accountId: string, requestingUserId: string, targetUserId: string): void {
    requireAdminOrOwner(accountId, requestingUserId);

    if (requestingUserId === targetUserId) {
      throw new Error('You cannot remove yourself from the workspace');
    }

    // Prevent removing the last owner
    const targetRole = Account.getMemberRole(accountId, targetUserId);
    if (!targetRole) {
      throw new Error('User is not a member of this workspace');
    }

    if (targetRole === 'owner') {
      const members = Account.getMembers(accountId);
      const ownerCount = members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        throw new Error('Cannot remove the last owner of the workspace');
      }
    }

    Account.removeMember(accountId, targetUserId);
    logger.info({ accountId, targetUserId }, 'Member removed from workspace');
  }

  static cancelInvite(accountId: string, userId: string, inviteId: string): void {
    requireAdminOrOwner(accountId, userId);

    const db = getDatabase();
    const invite = db
      .select()
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.id, inviteId), eq(workspaceInvites.accountId, accountId)))
      .get();

    if (!invite) {
      throw new Error('Invite not found');
    }

    db.delete(workspaceInvites)
      .where(eq(workspaceInvites.id, inviteId))
      .run();

    logger.info({ accountId, inviteId }, 'Invite cancelled');
  }

  static updateMemberRole(
    accountId: string,
    requestingUserId: string,
    targetUserId: string,
    newRole: string,
  ): void {
    const requesterRole = Account.getMemberRole(accountId, requestingUserId);
    if (requesterRole !== 'owner') {
      throw new Error('Only workspace owners can change member roles');
    }

    if (newRole !== 'owner' && newRole !== 'admin' && newRole !== 'member') {
      throw new Error('Invalid role');
    }

    const targetRole = Account.getMemberRole(accountId, targetUserId);
    if (!targetRole) {
      throw new Error('User is not a member of this workspace');
    }

    // Prevent changing the last owner's role away from owner
    if (targetRole === 'owner' && newRole !== 'owner') {
      const members = Account.getMembers(accountId);
      const ownerCount = members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        throw new Error('Cannot change the role of the last owner');
      }
    }

    Account.updateMemberRole(accountId, targetUserId, newRole);
    logger.info({ accountId, targetUserId, newRole }, 'Member role updated');
  }

  static getPendingInvitesForUser(email: string): Array<{
    id: string;
    token: string;
    accountId: string;
    accountName: string;
    role: string;
    expiresAt: Date;
  }> {
    const db = getDatabase();
    return db
      .select({
        id: workspaceInvites.id,
        token: workspaceInvites.token,
        accountId: workspaceInvites.accountId,
        accountName: accounts.name,
        role: workspaceInvites.role,
        expiresAt: workspaceInvites.expiresAt,
      })
      .from(workspaceInvites)
      .innerJoin(accounts, eq(workspaceInvites.accountId, accounts.id))
      .where(
        and(
          eq(workspaceInvites.email, email),
          eq(workspaceInvites.status, 'pending'),
        ),
      )
      .all()
      .filter((inv) => new Date() < inv.expiresAt);
  }
}
