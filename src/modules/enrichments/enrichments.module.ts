import { Module } from '@nestjs/common';

import { ContentsModule } from '../contents/contents.module';
import { EnrichmentsController } from './enrichments.controller';
import { EnrichmentsService } from './enrichments.service';

@Module({
  imports: [ContentsModule],
  controllers: [EnrichmentsController],
  providers: [EnrichmentsService],
})
export class EnrichmentsModule {}
