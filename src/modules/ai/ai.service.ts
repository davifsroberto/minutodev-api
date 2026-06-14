import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DeepSeekProvider } from './providers/deepseek.provider';
import {
  EnrichContentInput,
  EnrichContentOutput,
  LlmProvider,
} from './providers/llm-provider.interface';
import { MockLlmProvider } from './providers/mock-llm.provider';

export type LlmProviderName = 'mock' | 'deepseek';

export const DEFAULT_LLM_PROVIDER: LlmProviderName = 'mock';

/**
 * Orquestra o enriquecimento de conteúdo sobre o provedor de IA selecionado por
 * `LLM_PROVIDER` (padrão: mock). Não conhece Prisma nem banco — apenas escolhe o
 * provedor e delega. A geração é sempre sob demanda: este serviço não dispara
 * nenhuma chamada automática.
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly mockProvider: MockLlmProvider,
    private readonly deepseekProvider: DeepSeekProvider,
  ) {}

  onModuleInit(): void {
    const name = this.resolveProviderName();
    const pending =
      name === 'deepseek' && !this.deepseekProvider.isConfigured()
        ? ' (sem DEEPSEEK_API_KEY — as chamadas falharão até a chave ser configurada)'
        : '';

    this.logger.log(`Provedor de IA ativo: ${name}${pending}.`);
  }

  enrichContent(input: EnrichContentInput): Promise<EnrichContentOutput> {
    return this.resolveProvider().enrichContent(input);
  }

  resolveProviderName(): LlmProviderName {
    const configured = process.env.LLM_PROVIDER?.trim().toLowerCase();

    if (configured === 'deepseek') {
      return 'deepseek';
    }

    if (!configured || configured === 'mock') {
      return DEFAULT_LLM_PROVIDER;
    }

    this.logger.warn(
      `LLM_PROVIDER="${configured}" não reconhecido; usando "${DEFAULT_LLM_PROVIDER}".`,
    );

    return DEFAULT_LLM_PROVIDER;
  }

  private resolveProvider(): LlmProvider {
    return this.resolveProviderName() === 'deepseek'
      ? this.deepseekProvider
      : this.mockProvider;
  }
}
