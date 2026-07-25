import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterDto,
  LoginDto,
  SendOtpDto,
  ForgotPasswordSendOtpDto,
  ForgotPasswordResetDto,
} from './dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { OAuth2Client } from 'google-auth-library';
import { AbuseService } from '../common/services/abuse.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { MailService } from '../mail/mail.service';
import { RefreshTokenRevokeReason } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;
  private readonly googleClient: OAuth2Client;
  private readonly googleClientId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly abuseService: AbuseService,
    private readonly auditLogService: AuditLogService,
    private readonly mailService: MailService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.googleClientId =
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.googleClient = new OAuth2Client(this.googleClientId);
  }

  // ──────────────────────────────────────────────
  // Registration & OTP
  // ──────────────────────────────────────────────

  async sendRegisterOtp(dto: SendOtpDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Check if user is already registered in DB
    const existingEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      throw new ConflictException('errors.email_registered');
    }

    // 2. Check if phone number is already taken
    if (dto.phoneNumber) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phoneNumber: dto.phoneNumber.trim() },
      });
      if (existingPhone) {
        throw new ConflictException('errors.phone_registered');
      }
    }

    // 3. Generate 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Save OTP directly to Database table (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.emailOtp.upsert({
      where: { email },
      update: {
        code: otpCode,
        expiresAt,
      },
      create: {
        email,
        code: otpCode,
        expiresAt,
      },
    });

    // Cache fallback
    const cacheKey = `otp:${email}`;
    await this.cacheManager.set(cacheKey, { code: otpCode, email }, 600000);

    // 5. Send OTP email using MailService
    await this.mailService.sendOtpEmail(email, otpCode, dto.firstName);

    return {
      success: true,
      message: 'Verification code sent to email',
      email,
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Verify OTP code from Database (or cache fallback)
    const dbOtp = await this.prisma.emailOtp.findUnique({
      where: { email },
    });

    const cacheKey = `otp:${email}`;
    const cachedOtp = await this.cacheManager.get<{ code: string; email: string }>(cacheKey);

    const isValidOtp = dbOtp
      ? dbOtp.code === dto.otp.trim() && new Date() <= dbOtp.expiresAt
      : cachedOtp?.code === dto.otp.trim();

    if (!isValidOtp) {
      throw new BadRequestException('errors.invalid_otp');
    }

    // 2. Check if email is already taken
    const existingEmail = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      throw new ConflictException('errors.email_registered');
    }

    // 3. Check if phone number is already taken
    const existingPhone = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (existingPhone) {
      throw new ConflictException('errors.phone_registered');
    }

    // 4. Hash the password
    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // 5. Create the user ONLY after OTP is verified
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
      },
    });

    // 6. Delete OTP record from Database & clear cache
    await this.prisma.emailOtp.delete({ where: { email } }).catch(() => null);
    await this.cacheManager.del(cacheKey).catch(() => null);

    // 7. Return JWT response
    return await this.buildTokenResponse(user);
  }

  // ──────────────────────────────────────────────
  // Forgot Password & OTP
  // ──────────────────────────────────────────────

  async sendForgotPasswordOtp(dto: ForgotPasswordSendOtpDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('errors.user_not_found');
    }

    // 2. Generate 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Save OTP in DB table (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.emailOtp.upsert({
      where: { email },
      update: { code: otpCode, expiresAt },
      create: { email, code: otpCode, expiresAt },
    });

    // 4. Save in cache fallback
    const cacheKey = `otp:${email}`;
    await this.cacheManager.set(cacheKey, { code: otpCode, email }, 600000);

    // 5. Send OTP email using MailService
    await this.mailService.sendOtpEmail(email, otpCode, user.firstName);

    return {
      success: true,
      message: 'Password reset code sent to email',
      email,
    };
  }

  async resetPasswordWithOtp(dto: ForgotPasswordResetDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('errors.user_not_found');
    }

    // 2. Verify OTP code from DB & cache
    const dbOtp = await this.prisma.emailOtp.findUnique({
      where: { email },
    });

    const cacheKey = `otp:${email}`;
    const cachedOtp = await this.cacheManager.get<{ code: string; email: string }>(cacheKey);

    const isValidOtp = dbOtp
      ? dbOtp.code === dto.otp.trim() && new Date() <= dbOtp.expiresAt
      : cachedOtp?.code === dto.otp.trim();

    if (!isValidOtp) {
      throw new BadRequestException('errors.invalid_otp');
    }

    // 3. Hash new password & update user
    const passwordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);
    await this.prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    // 4. Clean up OTP record
    await this.prisma.emailOtp.delete({ where: { email } }).catch(() => null);
    await this.cacheManager.del(cacheKey).catch(() => null);

    return {
      success: true,
      message: 'Password reset successfully',
    };
  }

  // ──────────────────────────────────────────────
  // Login
  // ──────────────────────────────────────────────

  async login(dto: LoginDto, ip: string, userAgent: string) {
    // 1. Brute force check
    await this.abuseService.checkLoginBruteForce(dto.email, ip);

    // 2. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      await this.abuseService.recordLoginFailure(dto.email, ip);
      await this.auditLogService.logLoginFailure(
        dto.email,
        'User not found',
        ip,
        userAgent,
      );
      throw new UnauthorizedException('errors.invalid_credentials');
    }

    // 3. Compare password with stored hash
    if (!user.passwordHash) {
      await this.abuseService.recordLoginFailure(dto.email, ip);
      await this.auditLogService.logLoginFailure(
        dto.email,
        'No password hash set',
        ip,
        userAgent,
      );
      throw new UnauthorizedException('errors.invalid_credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      await this.abuseService.recordLoginFailure(dto.email, ip);
      await this.auditLogService.logLoginFailure(
        dto.email,
        'Invalid password',
        ip,
        userAgent,
      );
      throw new UnauthorizedException('errors.invalid_credentials');
    }

    // 4. Check if user is active
    if (!user.isActive) {
      await this.auditLogService.logLoginFailure(
        dto.email,
        'User deactivated',
        ip,
        userAgent,
      );
      throw new UnauthorizedException('errors.user_deactivated');
    }

    // 5. Successful login resets counter
    await this.abuseService.resetLoginFailures(dto.email, ip);

    // Audit log success
    await this.auditLogService.logLoginSuccess(
      user.id,
      user.email,
      ip,
      userAgent,
    );

    // 6. Return JWT
    return await this.buildTokenResponse(user);
  }

  // ──────────────────────────────────────────────
  // Google Authentication
  // ──────────────────────────────────────────────

  async verifyGoogleToken(token: string) {
    if (!token) {
      throw new UnauthorizedException('errors.invalid_google_token');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: this.googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new Error('Invalid token payload');
      }
      return {
        email: payload.email,
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
      };
    } catch (error) {
      this.logger.warn(
        `Google token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new UnauthorizedException('errors.invalid_google_token');
    }
  }

  async googleLogin(token: string, ip: string, userAgent: string) {
    try {
      // 1. Verify Google token and get user details
      const googleUser = await this.verifyGoogleToken(token);

      // 2. Find if user exists by email
      let user = await this.prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (!user) {
        // 3. Create user if they don't exist
        user = await this.prisma.user.create({
          data: {
            email: googleUser.email,
            firstName: googleUser.firstName,
            lastName: googleUser.lastName,
            passwordHash: null,
            phoneNumber: null,
            role: 'CLIENT',
            isActive: true,
          },
        });

        await this.auditLogService.log({
          userId: user.id,
          action: 'GOOGLE_SIGNUP',
          ip,
          userAgent,
        });
      } else {
        // Check if user is active
        if (!user.isActive) {
          await this.auditLogService.logLoginFailure(
            googleUser.email,
            'User deactivated (Google)',
            ip,
            userAgent,
          );
          throw new UnauthorizedException('errors.user_deactivated');
        }
      }

      await this.auditLogService.logLoginSuccess(
        user.id,
        user.email,
        ip,
        userAgent,
      );

      // 4. Return JWT
      return await this.buildTokenResponse(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      await this.auditLogService.logLoginFailure(
        'unknown',
        `Google login failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ip,
        userAgent,
      );
      throw error;
    }
  }

  async refresh(refreshToken: string, ip: string, userAgent: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('errors.invalid_refresh_token');
    }

    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('errors.invalid_refresh_token');
    }

    if (storedToken.isRevoked) {
      await this.auditLogService.logRefreshTokenReuse(
        storedToken.userId,
        tokenHash,
        ip,
        userAgent,
      );

      throw new UnauthorizedException('errors.refresh_token_reused');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('errors.refresh_token_expired');
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedException('errors.user_deactivated');
    }

    // generate new refresh token
    const newRefreshToken = this.generateRefreshToken();
    const newHash = this.hashToken(newRefreshToken);

    const newToken = await this.prisma.refreshToken.create({
      data: {
        tokenHash: newHash,
        userId: storedToken.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: RefreshTokenRevokeReason.ROTATED,
        replacedBy: newToken.id,
      },
    });

    const payload: JwtPayload = {
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
        firstName: storedToken.user.firstName,
        lastName: storedToken.user.lastName,
        phoneNumber: storedToken.user.phoneNumber,
      },
    };
  }

  async logout(refreshToken: string, ip: string, userAgent: string) {
    if (!refreshToken) return;

    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: RefreshTokenRevokeReason.LOGOUT,
      },
    });

    if (storedToken?.userId) {
      await this.auditLogService.logLogout(storedToken.userId, ip, userAgent);
    }
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  private generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async buildTokenResponse(user: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as JwtPayload['role'],
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.auditLogService.log({
      userId: user.id,
      action: 'REFRESH_TOKEN_CREATED',
      ip: 'system',
      userAgent: 'system',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
      },
    };
  }
}
