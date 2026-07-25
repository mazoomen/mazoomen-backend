import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private getTransporter(): nodemailer.Transporter | null {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || process.env.OTP_SENDER_EMAIL || 'aimanbanihani3@gmail.com';
    const pass = process.env.SMTP_PASS?.trim();

    if (user && pass) {
      if (host.includes('gmail.com')) {
        return nodemailer.createTransport({
          service: 'gmail',
          auth: { user, pass },
        });
      }

      return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }

    return null;
  }

  async sendOtpEmail(toEmail: string, otpCode: string, name?: string): Promise<boolean> {
    const senderEmail = process.env.SMTP_USER || process.env.OTP_SENDER_EMAIL || 'aimanbanihani3@gmail.com';
    const targetEmail = toEmail || senderEmail;
    const transporter = this.getTransporter();

    const subject = `Your Mazoomen Verification Code: ${otpCode}`;
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background-color: #FAF8F5; border-radius: 16px; border: 1px solid #EBE7DF; color: #2D3142;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="font-family: Georgia, serif; color: #0B1528; margin: 0; font-size: 24px;">Mazoomen | معزومين</h2>
          <p style="color: #7F8487; font-size: 13px; margin-top: 4px;">Email Verification Code</p>
        </div>

        <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #E6E2DA; text-align: center; margin-bottom: 20px;">
          <p style="font-size: 14px; color: #4A4A4A; margin-top: 0;">Hello ${name || 'there'},</p>
          <p style="font-size: 13px; color: #666; margin-bottom: 20px;">Use the following code to complete your registration:</p>

          <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0B1528; background-color: #F5EDE1; padding: 12px 24px; border-radius: 8px; display: inline-block; margin: 10px 0;">
            ${otpCode}
          </div>

          <p style="font-size: 11px; color: #999; margin-top: 20px; margin-bottom: 0;">This code is valid for 10 minutes. Do not share it with anyone.</p>
        </div>

        <div style="text-align: center; font-size: 11px; color: #A0A0A0;">
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} Mazoomen. All rights reserved.</p>
        </div>
      </div>
    `;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"Mazoomen" <${senderEmail}>`,
          to: targetEmail,
          subject,
          html: htmlContent,
        });
        this.logger.log(`========================================================================`);
        this.logger.log(`[SMTP SUCCESS] Real email sent to inbox: ${targetEmail} | Code: [ ${otpCode} ]`);
        this.logger.log(`========================================================================`);
        return true;
      } catch (error) {
        this.logger.error(`[SMTP ERROR] Failed to send email via SMTP to ${targetEmail}. Check SMTP_PASS in .env`, error);
      }
    }

    // Prominent console log fallback for dev testing when SMTP_PASS is missing or failing
    this.logger.warn(`========================================================================`);
    this.logger.warn(`[OTP CODE FOR TESTING]: [ ${otpCode} ] (Recipient: ${targetEmail})`);
    this.logger.warn(`[NOTICE]: To send real emails to your Gmail inbox, paste your 16-character`);
    this.logger.warn(`          Google App Password into SMTP_PASS inside mazoom-backend/.env`);
    this.logger.warn(`========================================================================`);
    return true;
  }
}
