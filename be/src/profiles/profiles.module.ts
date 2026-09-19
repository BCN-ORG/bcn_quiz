import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { ProfilesService } from './profiles.service';

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
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
