import "dotenv/config";

import { PrismaClient, RoleUtilisateur, StatutUtilisateur } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as bcrypt from "bcrypt";

const dbUrl = new URL(process.env.DATABASE_URL!);

const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 3306),
  user: decodeURIComponent(dbUrl.username || "root"),
  password: decodeURIComponent(dbUrl.password || ""),
  database: dbUrl.pathname.replace("/", ""),
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const motDePasseHash = await bcrypt.hash("Admin@123", 10);

  const admin = await prisma.utilisateur.findFirst({
    where: {
      email: "admin@bws.tn",
      role: RoleUtilisateur.ADMINISTRATEUR,
    },
    select: { id: true },
  });

  if (!admin) {
    await prisma.utilisateur.create({
      data: {
        email: "admin@bws.tn",
        motDePasseHash,
        nomComplet: "Administrateur Principal",
        role: RoleUtilisateur.ADMINISTRATEUR,
        statut: StatutUtilisateur.ACTIF,
      },
    });

    console.log("✅ Administrateur créé avec succès");
  } else {
    console.log("ℹ️ Administrateur déjà existant");
  }
}

main()
  .catch((error) => {
    console.error("❌ Erreur lors du seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });