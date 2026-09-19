import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import * as http from 'http';
import * as https from 'https';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

const keepAliveMs = 60_000;

@Module({
  imports: [
    HttpModule.register({
      httpAgent: new http.Agent({
        keepAlive: true,
        maxSockets: 100,
        keepAliveMsecs: keepAliveMs,
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 100,
        keepAliveMsecs: keepAliveMs,
      }),
      timeout: Number(process.env.PROFILES_HTTP_TIMEOUT_MS ?? 10_000),
      maxRedirects: 0,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
