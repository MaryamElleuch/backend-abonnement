import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard JWT basé sur Passport
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
