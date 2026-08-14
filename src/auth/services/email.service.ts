import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  async sendPasswordReset(email: string, token: string): Promise<boolean> {
    const host = this.configService.get<string>('MAIL_HOST');
    const user = this.configService.get<string>('MAIL_USER');
    const password = this.configService.get<string>('MAIL_PASSWORD');
    const from = this.configService.get<string>('MAIL_FROM');
    const resetUrl = this.configService.get<string>('PASSWORD_RESET_URL');
    if (!host || !user || !password || !from || !resetUrl) return false;

    const port = this.configService.get<number>('MAIL_PORT') ?? 587;
    const secure = this.configService.get<boolean>('MAIL_SECURE') ?? false;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
    });
    const url = `${resetUrl}${resetUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    await transporter.sendMail({
      from,
      to: email,
      subject: 'Touch Grass - Đặt lại mật khẩu',
      text: `Liên kết đặt lại mật khẩu có hiệu lực trong 15 phút: ${url}`,
    });
    return true;
  }
}
