import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import * as express from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  GoogleLoginDto,
  RefreshDto,
  SendOtpDto,
  ForgotPasswordSendOtpDto,
  ForgotPasswordResetDto,
} from './dto';
import { AbuseService } from '../common/services/abuse.service';

/** Shared cookie configuration for access tokens. */
const ACCESS_TOKEN_COOKIE_OPTIONS: express.CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 15 * 60 * 1000,
};

/** Shared cookie configuration for refresh tokens. */
const REFRESH_TOKEN_COOKIE_OPTIONS: express.CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly abuseService: AbuseService,
  ) {}

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  /**
   * Sets the access token as an HTTP-only cookie on the response.
   */
  private setAccessTokenCookie(
    response: express.Response,
    accessToken: string,
  ): void {
    response.cookie('accessToken', accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
  }

  /**
   * Sets the refresh token as an HTTP-only cookie on the response.
   */
  private setRefreshTokenCookie(
    response: express.Response,
    refreshToken: string,
  ): void {
    response.cookie('refreshToken', refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);
  }

  // ──────────────────────────────────────────────
  // Endpoints
  // ──────────────────────────────────────────────

  /**
   * POST /auth/send-otp
   * Sends an OTP verification code to the target email.
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send registration OTP code to email',
    description: 'Generates a 6-digit OTP code and emails it to the user.',
  })
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendRegisterOtp(dto);
  }

  /**
   * POST /auth/forgot-password/send-otp
   * Sends a 6-digit OTP code to the user's email for password reset.
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('forgot-password/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send forgot password OTP code to email',
    description: 'Generates a 6-digit OTP code and emails it to registered user.',
  })
  async sendForgotPasswordOtp(@Body() dto: ForgotPasswordSendOtpDto) {
    return this.authService.sendForgotPasswordOtp(dto);
  }

  /**
   * POST /auth/forgot-password/reset
   * Verifies OTP code and updates user's password.
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('forgot-password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password with OTP verification code',
    description: 'Verifies 6-digit OTP code and resets user password.',
  })
  async resetPasswordWithOtp(@Body() dto: ForgotPasswordResetDto) {
    return this.authService.resetPasswordWithOtp(dto);
  }

  /**
   * POST /auth/register
   * Creates a new CLIENT account and returns a JWT.
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('register')
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates a new CLIENT user and returns a JWT token for immediate authentication.',
  })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully',
    schema: {
      example: {
        user: {
          id: 'c3a1e1d0-4f6a-4b2c-9e8f-1a2b3c4d5e6f',
          email: 'ahmed@mazoomen.app',
          role: 'CLIENT',
          firstName: 'Ahmed',
          lastName: 'Al-Rashid',
          phoneNumber: '+966501234567',
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Email or phone number already registered',
    schema: {
      example: {
        statusCode: 409,
        message: 'Email is already registered',
        error: 'Conflict',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed — invalid input data',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: express.Response,
  ) {
    const result = await this.authService.register(dto);
    this.setAccessTokenCookie(response, result.accessToken);
    this.setRefreshTokenCookie(response, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /**
   * POST /auth/login
   * Validates credentials and returns a JWT.
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login to an existing account',
    description: 'Validates email and password, then returns a JWT token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        user: {
          id: 'c3a1e1d0-4f6a-4b2c-9e8f-1a2b3c4d5e6f',
          email: 'ahmed@mazoomen.app',
          role: 'CLIENT',
          firstName: 'Ahmed',
          lastName: 'Al-Rashid',
          phoneNumber: '+966501234567',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid credentials',
        error: 'Unauthorized',
      },
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ) {
    const ip = this.abuseService.extractIp(request);
    const userAgent = request.headers['user-agent'] || '';
    const result = await this.authService.login(dto, ip, userAgent);
    this.setAccessTokenCookie(response, result.accessToken);
    this.setRefreshTokenCookie(response, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /**
   * POST /auth/google
   * Validates Google credential token, registers/logs in the user and returns a JWT.
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login or register with Google',
    description:
      'Validates Google ID Token, creates user if they do not exist, and returns JWT.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ) {
    const ip = this.abuseService.extractIp(request);
    const userAgent = request.headers['user-agent'] || '';
    const result = await this.authService.googleLogin(dto.token, ip, userAgent);
    this.setAccessTokenCookie(response, result.accessToken);
    this.setRefreshTokenCookie(response, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /**
   * POST /auth/refresh
   * Validates refresh token cookie and returns a new access token + rotates refresh token.
   */
  @SkipThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Validates the HTTP-only refresh token, rotates it, and returns a new short-lived access token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Access token refreshed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refresh(
    @Req() request: express.Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) response: express.Response,
  ) {
    const refreshToken = dto.refreshToken || request.cookies['refreshToken'];
    const ip = this.abuseService.extractIp(request);
    const userAgent = request.headers['user-agent'] || '';
    const result = await this.authService.refresh(refreshToken, ip, userAgent);
    this.setAccessTokenCookie(response, result.accessToken);
    this.setRefreshTokenCookie(response, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /**
   * POST /auth/logout
   * Clears the refresh token cookie and invalidates it in the database.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout user',
    description:
      'Clears the refresh token cookie and invalidates the session in the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  async logout(
    @Req() request: express.Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) response: express.Response,
  ) {
    const refreshToken = dto.refreshToken || request.cookies['refreshToken'];
    const ip = this.abuseService.extractIp(request);
    const userAgent = request.headers['user-agent'] || '';
    await this.authService.logout(refreshToken, ip, userAgent);

    response.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });

    return { message: 'Logged out successfully' };
  }
}
