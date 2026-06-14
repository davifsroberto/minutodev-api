import { runOgImageBackfill } from './og-image-backfill';

type Row = { id: string; url: string; imageUrl: string | null };

/**
 * Prisma falso que pagina por cursor de `id` sobre um conjunto em memória,
 * sempre filtrando por `imageUrl: null` — reproduz o comportamento real o
 * suficiente para validar avanço de cursor, idempotência e parada.
 */
const fakePrisma = (rows: Row[]) => {
  const findMany = jest.fn(
    (args: {
      where: { imageUrl: null; id?: { gt: string } };
      take: number;
    }) => {
      const after = args.where.id?.gt;
      const pending = rows
        .filter((r) => r.imageUrl === null)
        .filter((r) => (after ? r.id > after : true))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, args.take)
        .map((r) => ({ id: r.id, url: r.url }));

      return Promise.resolve(pending);
    },
  );

  const update = jest.fn(
    (args: { where: { id: string }; data: { imageUrl: string } }) => {
      const row = rows.find((r) => r.id === args.where.id);
      if (row) row.imageUrl = args.data.imageUrl;

      return Promise.resolve(row);
    },
  );

  return { content: { findMany, update }, findMany, update };
};

describe('runOgImageBackfill', () => {
  it('preenche imageUrl via og:image, avançando o cursor por id', async () => {
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: `id-${i}`,
      url: `https://example.com/${i}`,
      imageUrl: null,
    }));
    const prisma = fakePrisma(rows);
    const openGraph = {
      resolveImageUrl: jest.fn().mockResolvedValue('https://cdn.test/capa.jpg'),
    };

    const summary = await runOgImageBackfill(
      prisma as never,
      openGraph as never,
    );

    expect(summary).toEqual({ scanned: 5, updated: 5 });
    expect(rows.every((r) => r.imageUrl === 'https://cdn.test/capa.jpg')).toBe(
      true,
    );
  });

  it('não entra em loop quando itens permanecem sem imagem (cursor avança)', async () => {
    const rows: Row[] = Array.from({ length: 3 }, (_, i) => ({
      id: `id-${i}`,
      url: `https://blocked.test/${i}`,
      imageUrl: null,
    }));
    const prisma = fakePrisma(rows);
    const openGraph = { resolveImageUrl: jest.fn().mockResolvedValue(null) };

    const summary = await runOgImageBackfill(
      prisma as never,
      openGraph as never,
    );

    expect(summary).toEqual({ scanned: 3, updated: 0 });
    expect(openGraph.resolveImageUrl).toHaveBeenCalledTimes(3);
    expect(prisma.update).not.toHaveBeenCalled();
  });

  it('é idempotente: ignora linhas que já têm imagem', async () => {
    const rows: Row[] = [
      { id: 'id-0', url: 'https://example.com/0', imageUrl: 'já-tem' },
      { id: 'id-1', url: 'https://example.com/1', imageUrl: null },
    ];
    const prisma = fakePrisma(rows);
    const openGraph = {
      resolveImageUrl: jest.fn().mockResolvedValue('https://cdn.test/x.jpg'),
    };

    const summary = await runOgImageBackfill(
      prisma as never,
      openGraph as never,
    );

    expect(summary).toEqual({ scanned: 1, updated: 1 });
    expect(openGraph.resolveImageUrl).toHaveBeenCalledTimes(1);
    expect(openGraph.resolveImageUrl).toHaveBeenCalledWith(
      'https://example.com/1',
    );
  });

  it('para imediatamente quando não há nada a fazer', async () => {
    const prisma = fakePrisma([]);
    const openGraph = { resolveImageUrl: jest.fn() };

    const summary = await runOgImageBackfill(
      prisma as never,
      openGraph as never,
    );

    expect(summary).toEqual({ scanned: 0, updated: 0 });
    expect(openGraph.resolveImageUrl).not.toHaveBeenCalled();
  });
});
