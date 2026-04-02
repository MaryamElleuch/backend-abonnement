// dto/sign-contrat.dto.ts
import { IsString } from 'class-validator';

export class SignContratDto {
  @IsString()
  signature!: string; // ex: "data:image/png;base64,iVBORw0KGgoAAA..."
}