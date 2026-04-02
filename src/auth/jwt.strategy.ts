import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    // Configuration de la stratégie JWT
  constructor(cfg: ConfigService) {
    // Appel du constructeur de la stratégie avec les options
    super({
        // Extraction du token JWT depuis l'en-tête Authorization (Bearer)
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.getOrThrow<string>('JWT_SECRET'),
    });
  }
  // Méthode de validation appelée après décodage du JWT

  validate(payload: any) {
   return {
    id: payload.sub,        // ✅ standard
    userId: payload.sub,    // ✅ compat avec ton ancien code
    role: payload.role,
    entrepriseId: payload.entrepriseId,
    email: payload.email || payload.sub,
  };
  }
}
