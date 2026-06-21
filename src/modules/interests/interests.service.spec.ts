import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma.service';
import { InterestsService } from './interests.service';

type PrismaServiceMock = {
  topic: { findMany: jest.Mock };
  userInterest: {
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('InterestsService', () => {
  let service: InterestsService;
  let prisma: PrismaServiceMock;

  beforeEach(async () => {
    prisma = {
      topic: { findMany: jest.fn() },
      userInterest: {
        findMany: jest.fn(),
        deleteMany: jest.fn().mockReturnValue({ op: 'delete' }),
        createMany: jest.fn().mockReturnValue({ op: 'create' }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        InterestsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(InterestsService);
  });

  it('lista o catálogo de temas habilitados ordenado por label', async () => {
    prisma.topic.findMany.mockResolvedValue([
      { slug: 'ai', label: 'IA' },
      { slug: 'frontend', label: 'Frontend' },
    ]);

    await expect(service.listCatalog()).resolves.toEqual([
      { slug: 'ai', label: 'IA' },
      { slug: 'frontend', label: 'Frontend' },
    ]);
    expect(prisma.topic.findMany).toHaveBeenCalledWith({
      where: { enabled: true },
      orderBy: { label: 'asc' },
      select: { slug: true, label: true },
    });
  });

  it('retorna os slugs de interesse do usuário', async () => {
    prisma.userInterest.findMany.mockResolvedValue([
      { topic: { slug: 'ai' } },
      { topic: { slug: 'cloud' } },
    ]);

    await expect(service.getForUser('user-1')).resolves.toEqual([
      'ai',
      'cloud',
    ]);
    expect(prisma.userInterest.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { topic: { label: 'asc' } },
      select: { topic: { select: { slug: true } } },
    });
  });

  it('substitui os interesses apagando os atuais e criando os novos numa transação', async () => {
    prisma.topic.findMany.mockResolvedValue([
      { id: 't-ai', slug: 'ai' },
      { id: 't-cloud', slug: 'cloud' },
    ]);
    prisma.userInterest.findMany.mockResolvedValue([
      { topic: { slug: 'ai' } },
      { topic: { slug: 'cloud' } },
    ]);

    await expect(
      service.replaceForUser('user-1', ['ai', 'cloud']),
    ).resolves.toEqual(['ai', 'cloud']);

    expect(prisma.userInterest.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.userInterest.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', topicId: 't-ai' },
        { userId: 'user-1', topicId: 't-cloud' },
      ],
      skipDuplicates: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { op: 'delete' },
      { op: 'create' },
    ]);
  });

  it('com array vazio apenas limpa os interesses (sem createMany)', async () => {
    prisma.topic.findMany.mockResolvedValue([]);
    prisma.userInterest.findMany.mockResolvedValue([]);

    await expect(service.replaceForUser('user-1', [])).resolves.toEqual([]);

    expect(prisma.userInterest.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.userInterest.createMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith([{ op: 'delete' }]);
  });

  it('rejeita slugs fora do catálogo com BadRequestException sem tocar no banco', async () => {
    prisma.topic.findMany.mockResolvedValue([{ id: 't-ai', slug: 'ai' }]);

    await expect(
      service.replaceForUser('user-1', ['ai', 'inexistente']),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.userInterest.deleteMany).not.toHaveBeenCalled();
  });

  it('deduplica slugs repetidos antes de validar e persistir', async () => {
    prisma.topic.findMany.mockResolvedValue([{ id: 't-ai', slug: 'ai' }]);
    prisma.userInterest.findMany.mockResolvedValue([{ topic: { slug: 'ai' } }]);

    await expect(
      service.replaceForUser('user-1', ['ai', 'ai']),
    ).resolves.toEqual(['ai']);

    expect(prisma.topic.findMany).toHaveBeenCalledWith({
      where: { slug: { in: ['ai'] }, enabled: true },
      select: { id: true, slug: true },
    });
    expect(prisma.userInterest.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', topicId: 't-ai' }],
      skipDuplicates: true,
    });
  });
});
