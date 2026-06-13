import { Module } from '@nestjs/common';

import { ContentsModule } from '../contents/contents.module';
import { RadarController } from './radar.controller';
import { RadarService } from './radar.service';

@Module({
  imports: [ContentsModule],
  controllers: [RadarController],
  providers: [RadarService],
})
export class RadarModule {}
