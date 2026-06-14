import { Injectable, Logger } from '@nestjs/common';

import { Content, ContentType, Source } from '@prisma/client';

import { startOfUtcDay } from '../../common/utils/utc-day.util';
import { ContentsService } from '../contents/contents.service';
import { RadarQueryDto } from './dto/radar-query.dto';
import {
  RADAR_SECTION_KEYS,
  RadarItemDto,
  RadarResponseDto,
  RadarSectionDto,
  RadarSectionKey,
} from './dto/radar-response.dto';

export const RADAR_MAX_DAILY_ITEMS = 500;

type RadarContent = Content & { source: Source };
type SectionBuckets = Record<RadarSectionKey, RadarContent[]>;

const TREND_CATEGORIES = new Set(['ai', 'engineering', 'community']);

@Injectable()
export class RadarService {
  private readonly logger = new Logger(RadarService.name);
  private now: () => Date = () => new Date();

  constructor(private readonly contents: ContentsService) {}

  setNowProvider(now: () => Date): void {
    this.now = now;
  }

  async getToday(query: RadarQueryDto): Promise<RadarResponseDto> {
    const requestedDay = this.resolveDay(query.date);
    const { day, items } = await this.resolveBriefing(requestedDay);

    const buckets = this.assignSections(items);
    const sections = this.buildSections(buckets, query.limitPerSection);
    const totalItems = sections.reduce(
      (total, section) => total + section.items.length,
      0,
    );

    return {
      date: this.formatDay(day),
      estimatedReadTimeMinutes: Math.min(15, totalItems * 2),
      sections,
    };
  }

  private async resolveBriefing(
    requestedDay: Date,
  ): Promise<{ day: Date; items: RadarContent[] }> {
    const items = await this.fetchEligible(requestedDay);
    if (items.length > 0) {
      return { day: requestedDay, items };
    }

    const fallbackDay =
      await this.contents.findMostRecentEligibleDay(requestedDay);
    if (fallbackDay === null) {
      return { day: requestedDay, items };
    }

    return { day: fallbackDay, items: await this.fetchEligible(fallbackDay) };
  }

  private async fetchEligible(day: Date): Promise<RadarContent[]> {
    const items = await this.contents.findEligibleForDay(
      day,
      RADAR_MAX_DAILY_ITEMS,
    );

    if (items.length === RADAR_MAX_DAILY_ITEMS) {
      this.logger.warn(
        `Radar daily item cap hit for ${this.formatDay(day)} (${RADAR_MAX_DAILY_ITEMS} items).`,
      );
    }

    return items;
  }

  private resolveDay(date?: string): Date {
    if (date !== undefined) {
      return startOfUtcDay(new Date(`${date}T00:00:00.000Z`));
    }

    return startOfUtcDay(this.now());
  }

  private assignSections(items: RadarContent[]): SectionBuckets {
    const buckets: SectionBuckets = {
      releases: [],
      tools: [],
      trends: [],
      recommended: [],
    };

    for (const item of items) {
      buckets[this.resolveSection(item)].push(item);
    }

    return buckets;
  }

  private resolveSection(item: RadarContent): RadarSectionKey {
    if (item.contentType === ContentType.RELEASE) {
      return 'releases';
    }

    if (
      item.contentType === ContentType.TOOL ||
      item.category === 'opensource'
    ) {
      return 'tools';
    }

    if (item.category !== null && TREND_CATEGORIES.has(item.category)) {
      return 'trends';
    }

    return 'recommended';
  }

  private buildSections(
    buckets: SectionBuckets,
    limitPerSection: number,
  ): RadarSectionDto[] {
    return RADAR_SECTION_KEYS.map((key) => ({
      key,
      items: buckets[key]
        .slice(0, limitPerSection)
        .map((item) => this.toRadarItem(item)),
    }));
  }

  private toRadarItem(item: RadarContent): RadarItemDto {
    return {
      category: item.category,
      contentType: item.contentType,
      id: item.id,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      sourceName: item.source.name,
      summary: item.summary,
      title: item.title,
      url: item.url,
    };
  }

  private formatDay(day: Date): string {
    return day.toISOString().slice(0, 10);
  }
}
