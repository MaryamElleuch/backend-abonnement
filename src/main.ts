import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  // ✅ désactiver le bodyParser automatique Nest
  const app = await NestFactory.create(AppModule, { bodyParser: false });
    // CORS pour le frontend React/Vite
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  // ✅ RAW uniquement pour Stripe webhook
  app.use('/stripe/webhook', bodyParser.raw({ type: 'application/json' }));

  // ✅ JSON pour le reste de l'app
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  const config = new DocumentBuilder()
    .setTitle('API Abonnements')
    .setDescription('Documentation de l’API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization', // ✅ IMPORTANT
        in: 'header',
      },
      'access-token', // ✅ IMPORTANT : doit matcher @ApiBearerAuth('access-token')
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();