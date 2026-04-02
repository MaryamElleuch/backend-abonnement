import { IsString, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';

export enum IntervalType {
  DAY = 'DAY',
  MONTH = 'MONTH',
  YEAR = 'YEAR'
}

export class CreateAbonnementDto {

  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  prix: number;

  @IsNumber()
  @Min(1)
  duree: number;

  @IsEnum(IntervalType)
  interval: IntervalType;
}