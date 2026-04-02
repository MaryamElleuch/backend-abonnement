import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.getOrThrow<string>('JWT_SECRET');
        const expiresIn = (cfg.get<string>('JWT_EXPIRES') ?? '1d') as StringValue;

        return {
          secret,
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
