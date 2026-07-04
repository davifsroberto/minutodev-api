import { Test, TestingModule } from '@nestjs/testing';

import { ContentType } from '@prisma/client';

import { AuthenticatedUser } from '../auth/auth.types';
import { RadarQueryDto } from './dto/radar-query.dto';
import {
  RadarForYouResponseDto,
  RadarResponseDto,
} from './dto/radar-response.dto';
import { RadarController } from './radar.controller';
import { RadarService } from './radar.service';

type RadarServiceMock = {
  getToday: jest.Mock<Promise<RadarResponseDto>, [RadarQueryDto]>;
  getForYou: jest.Mock<
    Promise<RadarForYouResponseDto>,
    [string, RadarQueryDto]
  >;
};

const createQuery = (overrides: Partial<RadarQueryDto> = {}): RadarQueryDto =>
  Object.assign(new RadarQueryDto(), overrides);

const createResponse = (): RadarResponseDto => ({
  date: '2026-06-13',
  estimatedReadTimeMinutes: 2,
  featuredId: 'release-1',
  sections: [
    {
      key: 'releases',
      items: [
        {
          category: 'engineering',
          contentType: ContentType.RELEASE,
          id: 'release-1',
          imageUrl: 'https://example.test/release-1.png',
          publishedAt: new Date('2026-06-13T09:00:00.000Z'),
          sourceCount: 1,
          sourceName: 'Release Source',
          summary: 'A release summary.',
          title: 'Release 1',
          url: 'https://example.test/release-1',
        },
      ],
    },
    { key: 'tools', items: [] },
    { key: 'trends', items: [] },
    { key: 'recommended', items: [] },
  ],
});

const createUser = (): AuthenticatedUser =>
  ({ id: 'user-1' }) as AuthenticatedUser;

describe('RadarController', () => {
  let controller: RadarController;
  let service: RadarServiceMock;

  beforeEach(async () => {
    service = {
      getForYou: jest.fn<
        Promise<RadarForYouResponseDto>,
        [string, RadarQueryDto]
      >(),
      getToday: jest.fn<Promise<RadarResponseDto>, [RadarQueryDto]>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RadarController],
      providers: [
        {
          provide: RadarService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(RadarController);
  });

  it('delegates the query to RadarService.getToday and returns its result unchanged', async () => {
    const query = createQuery();
    const response = createResponse();
    service.getToday.mockResolvedValue(response);

    await expect(controller.getToday(query)).resolves.toBe(response);
    expect(service.getToday).toHaveBeenCalledWith(query);
  });

  it('passes date and limitPerSection through unchanged', async () => {
    const query = createQuery({
      date: '2026-05-20',
      limitPerSection: 7,
    });
    service.getToday.mockResolvedValue(createResponse());

    await controller.getToday(query);

    expect(service.getToday).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-05-20',
        limitPerSection: 7,
      }),
    );
  });

  it('delegates for-you to getForYou with the authenticated user id and query', async () => {
    const query = createQuery({ limitPerSection: 6 });
    const response: RadarForYouResponseDto = {
      ...createResponse(),
      personalized: true,
      personalizationFallback: false,
    };
    service.getForYou.mockResolvedValue(response);

    await expect(controller.getForYou(createUser(), query)).resolves.toBe(
      response,
    );
    expect(service.getForYou).toHaveBeenCalledWith('user-1', query);
    expect(service.getToday).not.toHaveBeenCalled();
  });
});
