import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiBody } from '@nestjs/swagger';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @ApiBody({
  schema: {
    example: {
  email: "example@gmail.com",
  motDePasse: "******"
}

  }
})
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.motDePasse , dto.entrepriseSlug);
  }


  // ✅ REGISTER (Entreprise ou Client)
  @ApiBody({
    schema: {
      example: {
        email: "user@gmail.com",
        motDePasse: "123456789",
        nomComplet: "Nom Test",
        role: "ENTREPRISE",

        // Champs pour ENTREPRISE
        nomEntreprise: "Tech Company",
        slug: "tech-company",
        logo: null,
        couleurPrincipale: "#0ea5e9",

        // Champ pour CLIENT
        entrepriseSlug: null
      }
    }
  })
  @Post('register')
  @ApiOperation({ summary: 'Inscription utilisateur (entreprise ou client)' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Get('me')
me(@Req() req: any) {
  return req.user;
}




}
