import { DECORATORS } from '@nestjs/swagger';

import { ContentType } from '@prisma/client';

import { instanceToPlain } from 'class-transformer';

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
    item.sourceCount = 3;
    item.imageUrl = 'https://devblogs.microsoft.com/typescript/cover.png';
    item.category = 'engineering';
    item.contentType = ContentType.RELEASE;
    item.publishedAt = new Date('2026-06-13T09:12:00.000Z');

    const section = new RadarSectionDto();
    section.key = 'releases';
    section.items = [item];

    const response = new RadarResponseDto();
    response.date = '2026-06-13';
    response.featuredId = item.id;
    response.sections = [section];
    response.estimatedReadTimeMinutes = 2;

    expect(instanceToPlain(response)).toEqual({
      date: '2026-06-13',
      estimatedReadTimeMinutes: 2,
      featuredId: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353',
      sections: [
        {
          items: [
            {
              category: 'engineering',
              contentType: ContentType.RELEASE,
              id: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353',
              imageUrl: 'https://devblogs.microsoft.com/typescript/cover.png',
              publishedAt: new Date('2026-06-13T09:12:00.000Z'),
              sourceCount: 3,
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

  it('supports a null featured id', () => {
    const response = new RadarResponseDto();
    response.featuredId = null;

    expect(instanceToPlain(response)).toEqual({ featuredId: null });
  });

  it('documents the relevance signals in Swagger metadata', () => {
    expect(
      Reflect.getMetadata(
        DECORATORS.API_MODEL_PROPERTIES,
        RadarItemDto.prototype,
        'sourceCount',
      ),
    ).toEqual(
      expect.objectContaining({
        example: 3,
        minimum: 1,
        type: Number,
      }),
    );
    expect(
      Reflect.getMetadata(
        DECORATORS.API_MODEL_PROPERTIES,
        RadarResponseDto.prototype,
        'featuredId',
      ),
    ).toEqual(
      expect.objectContaining({
        nullable: true,
        type: String,
      }),
    );
  });
});
