import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  Matches,
} from 'class-validator';

export enum RegisterType {
  ENTREPRISE = 'ENTREPRISE',
  CLIENT = 'CLIENT',
}

export class RegisterDto {
  @ApiProperty({ example: 'contact@novatech-consulting.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'NovaTech2024!' })
  @IsString()
  @MinLength(6)
  motDePasse: string;

  @ApiPropertyOptional({ example: 'Karim Haddad' })
  @IsString()
  @IsOptional()
  nomComplet?: string;

  @ApiProperty({ enum: RegisterType, example: RegisterType.ENTREPRISE })
  @IsEnum(RegisterType)
  type: RegisterType;

  // ============= ENTREPRISE fields =============

  @ApiPropertyOptional({ example: 'NovaTech Consulting' })
  @ValidateIf((o) => o.type === RegisterType.ENTREPRISE)
  @IsString()
  @IsNotEmpty()
  nomEntreprise?: string;

  @ApiPropertyOptional({ example: 'novatech-consulting' })
  @ValidateIf((o) => o.type === RegisterType.ENTREPRISE)
  @IsString()
  @IsNotEmpty()
  // slug simple (lettres/nombres/tirets)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug doit contenir uniquement des minuscules, chiffres et tirets (ex: mon-entreprise-1)',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'https://novatech-consulting.com/assets/logo.png' })
  @ValidateIf((o) => o.type === RegisterType.ENTREPRISE)
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional({ example: '#1e3a8a' })
  @ValidateIf((o) => o.type === RegisterType.ENTREPRISE)
  @IsString()
  @IsOptional()
  couleurPrincipale?: string;

  // ============= CLIENT fields =============

  @ApiPropertyOptional({ example: 'novatech-consulting' })
  @ValidateIf((o) => o.type === RegisterType.CLIENT)
  @IsString()
  @IsNotEmpty()
  entrepriseSlug?: string;
}
