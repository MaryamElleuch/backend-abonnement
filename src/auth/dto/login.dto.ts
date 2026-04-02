import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty()

  @IsEmail()
  email: string;
    @ApiProperty()

  @IsString()
  @MinLength(4)
  motDePasse: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entrepriseSlug?: string;
}
