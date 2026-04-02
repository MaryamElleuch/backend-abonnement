// Override Prisma client loading to avoid stub issues
import * as path from 'path';

let client: any;

export function getPrismaClient() {
  if (!client) {
    const prismaClientPath = path.join(process.cwd(), 'node_modules/.prisma/client/index.js');
    const mod = require(prismaClientPath);
    client = mod.PrismaClient;
  }
  return client;
}
