import { Module } from '@nestjs/common';
import { ContratController } from './contrat.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { ContratService } from './contrat.service';

@Module({
  providers: [ContratService , PrismaService],
  controllers: [ContratController], 
   exports: [ContratService] // pour utiliser dans le webhooks 
})
export class ContratModule {}
