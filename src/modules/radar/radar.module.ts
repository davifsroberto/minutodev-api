import { Module } from '@nestjs/common';

import { ContentsModule } from '../contents/contents.module';
import { InterestsModule } from '../interests/interests.module';
import { RadarController } from './radar.controller';
import { RadarService } from './radar.service';
import { RelevanceService } from './relevance.service';

@Module({
  imports: [ContentsModule, InterestsModule],
  controllers: [RadarController],
  providers: [RadarService, RelevanceService],
})
export class RadarModule {}
