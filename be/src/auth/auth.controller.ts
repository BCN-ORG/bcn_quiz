import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import type { Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import { BearerAuthGuard } from './guards/auth.guard';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('login')
  @Header('Cache-Control', 'no-store')
  login(@Response() response: ExpressResponse) {
    const flow = this.authService.startLogin();
    response.setHeader('set-cookie', flow.setCookies);
    return response.redirect(302, flow.authorizationUrl);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('callback')
  @Header('Cache-Control', 'no-store')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Request() request: ExpressRequest,
    @Response() response: ExpressResponse,
  ) {
    try {
      const result = await this.authService.finishLogin(
        code,
        state,
        request.headers.cookie,
      );
      response.setHeader('set-cookie', result.setCookies);
      if (result.redirectUrl) return response.redirect(302, result.redirectUrl);
      return response.status(200).json({
        authenticated: true,
        user: result.profile,
      });
    } catch (error) {
      response.setHeader(
        'set-cookie',
        this.authService.clearTransientCookies(),
      );
      throw error;
    }
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Request() request: ExpressRequest,
    @Response({ passthrough: true }) response: ExpressResponse,
  ) {
    const { setCookies, ...result } = await this.authService.refresh(
      request.headers.cookie,
    );
    response.setHeader('set-cookie', setCookies);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Request() request: ExpressRequest,
    @Response({ passthrough: true }) response: ExpressResponse,
  ) {
    const { setCookies, ...result } = await this.authService.logout(
      request.headers.cookie,
      request.headers.authorization,
    );
    response.setHeader('set-cookie', setCookies);
    return result;
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(BearerAuthGuard)
  me(@Request() request: ExpressRequest & { user?: unknown }) {
    return request.user;
  }
}
