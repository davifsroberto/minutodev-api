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
      shortSummary:
        summary ?? `Resumo de exemplo (mock) para "${input.title}".`,
      whyItMatters: `Conteúdo potencialmente relevante para desenvolvedores acompanharem, segundo ${source}.`,
      keyPoints: [
        `Tema: ${input.title}`,
        `Fonte: ${source}`,
        'Saída de exemplo gerada pelo provedor mock (sem IA real).',
      ],
      example: `Exemplo de exemplo (mock) relacionado a "${input.title}".`,
      whenToUse: `Quando você quiser validar o fluxo sem IA real (mock), segundo ${source}.`,
      briefContent:
        summary ??
        `Versão condensada de exemplo (mock) de "${input.title}". Configure um provedor de IA real para gerar o conteúdo definitivo.`,
    });
  }
}
