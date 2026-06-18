import { Injectable, Logger } from '@nestjs/common';

import { Content, ContentType, Source } from '@prisma/client';

import { startOfUtcDay } from '../../common/utils/utc-day.util';
import {
  ContentsService,
  ContentTranslation,
} from '../contents/contents.service';
import { RadarQueryDto } from './dto/radar-query.dto';
import {
  RADAR_SECTION_KEYS,
  RadarItemDto,
  RadarResponseDto,
  RadarSectionDto,
  RadarSectionKey,
} from './dto/radar-response.dto';
import {
  compareRelevanceCandidates,
  RelevanceRanking,
  RelevanceService,
  RelevanceSignal,
} from './relevance.service';

export const RADAR_MAX_DAILY_ITEMS = 500;

type RadarContent = Content & { source: Source };
type SectionBuckets = Record<RadarSectionKey, RadarContent[]>;

const TREND_CATEGORIES = new Set(['ai', 'engineering', 'community']);

@Injectable()
export class RadarService {
  private readonly logger = new Logger(RadarService.name);
  private now: () => Date = () => new Date();

  constructor(
    private readonly contents: ContentsService,
    private readonly relevance: RelevanceService,
  ) {}

  setNowProvider(now: () => Date): void {
    this.now = now;
  }

  async getToday(query: RadarQueryDto): Promise<RadarResponseDto> {
    const now = this.now();
    const requestedDay = this.resolveDay(query.date, now);
    const { day, items } = await this.resolveBriefing(requestedDay);
    const translations = await this.contents.findReadyTranslations(
      items.map((item) => item.id),
    );
    const ranking = this.relevance.rank(
      items,
      new Set(translations.keys()),
      now,
    );

    const buckets = this.sortBuckets(this.assignSections(items), ranking);
    const sections = this.localizeSections(
      this.buildSections(buckets, ranking, query.limitPerSection),
      translations,
    );
    const totalItems = sections.reduce(
      (total, section) => total + section.items.length,
      0,
    );

    return {
      date: this.formatDay(day),
      estimatedReadTimeMinutes: Math.min(15, totalItems * 2),
      featuredId: this.resolveFeaturedId(ranking.featuredId, sections),
      sections,
    };
  }

  private localizeSections(
    sections: RadarSectionDto[],
    translations: Map<string, ContentTranslation>,
  ): RadarSectionDto[] {
    if (translations.size === 0) return sections;

    return sections.map((section) => ({
      ...section,
      items: section.items.map((item) => this.localizeItem(item, translations)),
    }));
  }

  private localizeItem(
    item: RadarItemDto,
    translations: Map<string, ContentTranslation>,
  ): RadarItemDto {
    const translation = translations.get(item.id);
    if (!translation) return item;

    return {
      ...item,
      title: translation.translatedTitle ?? item.title,
      summary:
        translation.shortSummary ?? translation.summary30s ?? item.summary,
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

  private resolveDay(date: string | undefined, now: Date): Date {
    if (date !== undefined) {
      return startOfUtcDay(new Date(`${date}T00:00:00.000Z`));
    }

    return startOfUtcDay(now);
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
    ranking: RelevanceRanking,
    limitPerSection: number,
  ): RadarSectionDto[] {
    return RADAR_SECTION_KEYS.map((key) => ({
      key,
      items: buckets[key]
        .slice(0, limitPerSection)
        .map((item) => this.toRadarItem(item, ranking.signals.get(item.id))),
    }));
  }

  private sortBuckets(
    buckets: SectionBuckets,
    ranking: RelevanceRanking,
  ): SectionBuckets {
    return Object.fromEntries(
      RADAR_SECTION_KEYS.map((key) => [
        key,
        buckets[key].sort((left, right) =>
          compareRelevanceCandidates(
            {
              item: left,
              signal: ranking.signals.get(left.id) ?? {
                score: 0,
                sourceCount: 1,
              },
            },
            {
              item: right,
              signal: ranking.signals.get(right.id) ?? {
                score: 0,
                sourceCount: 1,
              },
            },
          ),
        ),
      ]),
    ) as SectionBuckets;
  }

  private toRadarItem(
    item: RadarContent,
    signal?: RelevanceSignal,
  ): RadarItemDto {
    return {
      category: item.category,
      contentType: item.contentType,
      id: item.id,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      sourceCount: signal?.sourceCount ?? 1,
      sourceName: item.source.name,
      summary: item.summary,
      title: item.title,
      url: item.url,
    };
  }

  private resolveFeaturedId(
    featuredId: string | null,
    sections: RadarSectionDto[],
  ): string | null {
    if (featuredId === null) return null;

    const isPresent = sections.some((section) =>
      section.items.some((item) => item.id === featuredId),
    );

    return isPresent ? featuredId : null;
  }

  private formatDay(day: Date): string {
    return day.toISOString().slice(0, 10);
  }
}
