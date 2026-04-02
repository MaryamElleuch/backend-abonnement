import { PartialType } from '@nestjs/mapped-types';
import { CreateAbonnementDto } from './create-abonnement.dto';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateAbonnementDto extends PartialType(CreateAbonnementDto) {
  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
