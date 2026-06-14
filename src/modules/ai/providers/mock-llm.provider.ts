import { Injectable } from '@nestjs/common';

import {
  EnrichContentInput,
  EnrichContentOutput,
  LlmProvider,
} from './llm-provider.interface';

/**
 * Provedor de IA fake para desenvolvimento.
 *
 * Não chama nenhuma API externa e não gera custo: deriva uma saída
 * determinística da própria entrada. É o provedor padrão (`LLM_PROVIDER=mock`)
 * e o fallback natural quando nenhuma chave de API está configurada.
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  enrichContent(input: EnrichContentInput): Promise<EnrichContentOutput> {
    const summary = input.summary?.trim() ? input.summary.trim() : null;
    const source = input.sourceName?.trim()
      ? input.sourceName.trim()
      : 'a fonte original';

    return Promise.resolve({
      translatedTitle: `[pt-BR] ${input.title}`,
      summary30s: `Resumo de 30s (mock) de "${input.title}". Saída de exemplo, sem IA real. Útil para validar o fluxo.`,
      shortSummary:
        summary ?? `Resumo de exemplo (mock) para "${input.title}".`,
      whyItMatters: `Conteúdo potencialmente relevante para desenvolvedores acompanharem, segundo ${source}.`,
      keyInsight: `Insight de exemplo (mock): a principal ideia de "${input.title}" apareceria aqui.`,
      keyPoints: [
        `Tema: ${input.title}`,
        `Fonte: ${source}`,
        'Saída de exemplo gerada pelo provedor mock (sem IA real).',
      ],
      example: `Exemplo de exemplo (mock) relacionado a "${input.title}".`,
      whenToUse: `Quando você quiser validar o fluxo sem IA real (mock), segundo ${source}.`,
      audienceFor: ['Desenvolvedores', 'Curiosos por tecnologia'],
      audienceIgnore: [
        'Quem busca o conteúdo definitivo (configure uma IA real)',
      ],
      briefContent:
        summary ??
        `Versão condensada de exemplo (mock) de "${input.title}". Configure um provedor de IA real para gerar o conteúdo definitivo.`,
    });
  }
}
