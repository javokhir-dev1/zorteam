import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthGuard } from './auth.guard';
import { AccessService } from './access.service';

/**
 * Global autentifikatsiya yadrosi: JWT, guard va huquq tekshiruvchi xizmat.
 * AuthGuard butun ilovaga qo'llanadi — @Public() bilan ochiladi.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') ?? '12h' } as any,
      }),
    }),
  ],
  providers: [AccessService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [JwtModule, AccessService],
})
export class AuthCoreModule {}
