import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEntrepriseDto {
  @ApiPropertyOptional()
  nom?: string;

  @ApiPropertyOptional()
  logo?: string;

  @ApiPropertyOptional()
  couleurPrincipale?: string;
}