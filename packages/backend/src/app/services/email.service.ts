import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../config/environment';
import { logger } from '../../lib/utils/logger';

let transporter: Transporter | null = null;

export class EmailService {
  static isConfigured(): boolean {
    return !!(config.smtp.host && config.smtp.user && config.smtp.pass);
  }

  private static getTransporter(): Transporter {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });
    }
    return transporter;
  }

  static async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const verifyUrl = `${config.appUrl}/verify-email?token=${token}`;

    if (!EmailService.isConfigured()) {
      logger.info({ to, verifyUrl }, 'SMTP not configured — verification link (use this to verify):');
      return;
    }

    const transport = EmailService.getTransporter();

    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject: 'Verify your Faultline account',
      html: `
        <h2>Welcome to Faultline, ${name}!</h2>
        <p>Click the link below to verify your email address:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
      `,
    });

    logger.info({ to }, 'Verification email sent');
  }

  static async sendInviteEmail(to: string, inviterName: string, workspaceName: string, token: string): Promise<void> {
    const inviteUrl = `${config.appUrl}/accept-invite?token=${token}`;

    if (!EmailService.isConfigured()) {
      logger.info({ to, inviteUrl }, 'SMTP not configured — invite link (use this to accept):');
      return;
    }

    const transport = EmailService.getTransporter();

    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject: `You've been invited to ${workspaceName} on Faultline`,
      html: `
        <h2>You're invited!</h2>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${workspaceName}</strong> on Faultline.</p>
        <p>Click the link below to accept the invitation:</p>
        <p><a href="${inviteUrl}">${inviteUrl}</a></p>
        <p>This invitation expires in 7 days.</p>
      `,
    });

    logger.info({ to }, 'Invite email sent');
  }
}
