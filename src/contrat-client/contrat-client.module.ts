import { Module } from '@nestjs/common';
import { ContratClientService } from './contrat-client.service';
import { ContratClientController } from './contrat-client.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [ContratClientService , PrismaService],
  controllers: [ContratClientController],
  exports: [ContratClientService],

})
export class ContratClientModule {}
