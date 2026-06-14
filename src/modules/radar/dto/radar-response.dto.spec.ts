import { ContentType } from '@prisma/client';

import {
  RADAR_SECTION_KEYS,
  RadarItemDto,
  RadarResponseDto,
  RadarSectionDto,
} from './radar-response.dto';

describe('RadarResponseDto', () => {
  it('defines the fixed radar section keys', () => {
    expect(RADAR_SECTION_KEYS).toEqual([
      'releases',
      'tools',
      'trends',
      'recommended',
    ]);
  });

  it('supports the trimmed radar response contract', () => {
    const item = new RadarItemDto();
    item.id = '9b7a1d8f-0e81-4f1a-b630-897fa7d40353';
    item.title = 'TypeScript 5.7 released';
    item.summary = null;
    item.url = 'https://devblogs.microsoft.com/typescript/';
    item.sourceName = 'TypeScript Blog';
    item.imageUrl = 'https://devblogs.microsoft.com/typescript/cover.png';
    item.category = 'engineering';
    item.contentType = ContentType.RELEASE;
    item.publishedAt = new Date('2026-06-13T09:12:00.000Z');

    const section = new RadarSectionDto();
    section.key = 'releases';
    section.items = [item];

    const response = new RadarResponseDto();
    response.date = '2026-06-13';
    response.sections = [section];
    response.estimatedReadTimeMinutes = 2;

    expect(response).toEqual({
      date: '2026-06-13',
      estimatedReadTimeMinutes: 2,
      sections: [
        {
          items: [
            {
              category: 'engineering',
              contentType: ContentType.RELEASE,
              id: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353',
              imageUrl: 'https://devblogs.microsoft.com/typescript/cover.png',
              publishedAt: new Date('2026-06-13T09:12:00.000Z'),
              sourceName: 'TypeScript Blog',
              summary: null,
              title: 'TypeScript 5.7 released',
              url: 'https://devblogs.microsoft.com/typescript/',
            },
          ],
          key: 'releases',
        },
      ],
    });
    expect(response.sections[0]).not.toHaveProperty('title');
    expect(response.sections[0].items[0]).not.toHaveProperty('rawData');
    expect(response.sections[0].items[0]).not.toHaveProperty('score');
    expect(response.sections[0].items[0]).not.toHaveProperty('sourceId');
  });
});
