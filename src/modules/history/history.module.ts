import { Module } from '@nestjs/common';

import { ContentsModule } from '../contents/contents.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [ContentsModule],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
