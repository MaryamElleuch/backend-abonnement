import { Global, Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Explicitly initialization of Prisma during module init
    // This will trigger onModuleInit on PrismaService
  }
}
