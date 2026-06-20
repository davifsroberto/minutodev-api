import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContentsModule } from './modules/contents/contents.module';
import { EnrichmentsModule } from './modules/enrichments/enrichments.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { RadarModule } from './modules/radar/radar.module';
import { SourcesModule } from './modules/sources/sources.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    DatabaseModule,
    SourcesModule,
    ContentsModule,
    EnrichmentsModule,
    AiModule,
    IngestionModule,
    RadarModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
