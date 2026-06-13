import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { ContentsModule } from './modules/contents/contents.module';
import { SourcesModule } from './modules/sources/sources.module';

@Module({
  imports: [DatabaseModule, SourcesModule, ContentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
