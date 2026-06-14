import { PrismaService } from '../../database/prisma.service';
import { OpenGraphImageService } from '../images/open-graph.service';

const BATCH_SIZE = 100;
const CONCURRENCY = 4;

export type OgImageBackfillSummary = { scanned: number; updated: number };

/**
 * Varre os conteúdos sem imagem e tenta preencher `imageUrl` via og:image.
 *
 * Paginação por **cursor de `id`** (não por `skip`): como itens que falham
 * permanecem com `imageUrl` nulo, paginar por offset os reprocessaria em loop —
 * o cursor sempre avança. Idempotente: só toca linhas com `imageUrl` nulo.
 *
 * Núcleo separado do CLI para ser testável sem subir o contexto Nest.
 */
export async function runOgImageBackfill(
  prisma: Pick<PrismaService, 'content'>,
  openGraph: Pick<OpenGraphImageService, 'resolveImageUrl'>,
  onProgress?: (summary: OgImageBackfillSummary) => void,
): Promise<OgImageBackfillSummary> {
  let scanned = 0;
  let updated = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.content.findMany({
      where: { imageUrl: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, url: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    if (!batch.length) break;
    cursor = batch[batch.length - 1].id;

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const slice = batch.slice(i, i + CONCURRENCY);
      const resolved = await Promise.all(
        slice.map(async (content) => {
          const imageUrl = await openGraph.resolveImageUrl(content.url);
          if (!imageUrl) return false;

          await prisma.content.update({
            where: { id: content.id },
            data: { imageUrl },
          });

          return true;
        }),
      );

      scanned += slice.length;
      updated += resolved.filter(Boolean).length;
    }

    onProgress?.({ scanned, updated });
  }

  return { scanned, updated };
}
