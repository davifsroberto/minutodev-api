import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ContentsModule } from '../contents/contents.module';
import { ImagesModule } from '../images/images.module';
import { EnrichmentsController } from './enrichments.controller';
import { EnrichmentsService } from './enrichments.service';

@Module({
  imports: [AiModule, ContentsModule, ImagesModule],
  controllers: [EnrichmentsController],
  providers: [EnrichmentsService],
})
export class EnrichmentsModule {}
