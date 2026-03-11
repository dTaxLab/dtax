/**
 * 邮件发送服务
 * 使用 Resend API 发送验证邮件和密码重置邮件。
 * 开发环境无 API key 时仅打印到控制台。
 */

import { Resend } from "resend";
import { config } from "../config";

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<void> {
  if (!resend) {
    console.log(
      `\n📧 EMAIL (dev mode)\nTo: ${to}\nSubject: ${subject}\n${html}\n`,
    );
    return;
  }

  await resend.emails.send({
    from: config.fromEmail,
    to,
    subject,
    html,
  });
}

export function verificationEmail(verifyUrl: string): {
  subject: string;
  html: string;
} {
  return {
    subject: "Verify your DTax account",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Welcome to DTax</h2>
        <p>Click the link below to verify your email address:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">
          Verify Email
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
      </div>
    `,
  };
}

export function resetPasswordEmail(resetUrl: string): {
  subject: string;
  html: string;
} {
  return {
    subject: "Reset your DTax password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Password Reset</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 15 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  };
}
