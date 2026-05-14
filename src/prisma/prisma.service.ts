import 'dotenv/config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Attention: Ne pas importer @prisma/client directement car le stub le chargerait
// Au lieu de cela, charger dynamiquement lors de l'initialisation

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: any;

  constructor() {
    // Ne rien faire dans le constructeur
  }

  async onModuleInit() {
    try {
      // Charger le client Prisma généré dynamiquement
      // Chemin direct au client généré pour éviter les problèmes d'import du stub
      
      const path = require('path');
      const clientPath = path.resolve(process.cwd(), 'node_modules/.prisma/client/index.js');
      const { PrismaClient } = require(clientPath);
      
      const dbUrl = new URL(process.env.DATABASE_URL!);
      const adapter = new PrismaMariaDb({
        host: dbUrl.hostname,
        port: Number(dbUrl.port || 3306),
        user: decodeURIComponent(dbUrl.username || 'root'),
        password: decodeURIComponent(dbUrl.password || ''),
        database: dbUrl.pathname.replace('/', ''),
        connectionLimit: 5,
      });

      this.client = new PrismaClient({ adapter });
      await this.client.$connect();
      
      console.log('✅ Prisma initialized successfully');
    } catch (error) {
      console.error('❌ Error during Prisma initialization:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.$disconnect();
    }
  }

  // Proxy all Prisma models
  // THIS ALLOWS: this.prismaService.user.findMany()
  get abonnement() {
    return this.client?.abonnement;
  }
  
  get utilisateur() {
    return this.client?.utilisateur;
  }
  
  get achatAbonnement() {
    return this.client?.achatAbonnement;
  }
  
  get Entreprise() {
    return this.client?.Entreprise;
  }
  
  get contratEntreprise() {
    return this.client?.contratEntreprise;
  }
  
  get signature() {
    return this.client?.signature;
  }
  
  get achatAbonnementClient() {
    return this.client?.achatAbonnementClient;
  }
  
  get abonnementEntreprise() {
    return this.client?.abonnementEntreprise;
  }
  
  get entreprise() {
    return this.client?.entreprise;
  }
  get stripeEvent() {
  return this.client?.stripeEvent;
  }
  get contratClient() {
  return this.client?.contratClient;
  }
  get paiementAbonnementEntreprise() {
  return this.client.paiementAbonnementEntreprise;
}

get paiementAbonnementClient() {
  return this.client.paiementAbonnementClient;
}
  // General Prisma methods
  $connect() {
    return this.client?.$connect?.();
  }
  
  $disconnect() {
    return this.client?.$disconnect?.();
  }
  
  $transaction(arg: any) {
    return this.client?.$transaction?.(arg);
  }
}