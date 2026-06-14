import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { InvalidLlmProviderError } from './ai.errors';
import type { LlmProviderName, LlmProviderRegistry } from './ai.tokens';
import { DEFAULT_LLM_PROVIDER, LLM_PROVIDER_REGISTRY } from './ai.tokens';
import {
  EnrichContentInput,
  EnrichContentOutput,
} from './providers/llm-provider.interface';

// Contrato público da camada de IA. Módulos de negócio dependem destes tipos
// pela fachada (AiService), nunca importando de `./providers/*` diretamente.
export type {
  EnrichContentInput,
  EnrichContentOutput,
  SupportedLanguage,
} from './providers/llm-provider.interface';

// Erro transitório (rate limit/5xx/timeout) exposto pela fachada para que os
// módulos de negócio decidam o tratamento (ex.: manter o registro retryável).
export { TransientAiError } from './ai.errors';

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
    @Inject(LLM_PROVIDER_REGISTRY)
    private readonly registry: LlmProviderRegistry,
  ) {}

  onModuleInit(): void {
    const name = this.resolveProviderName();
    const pending = this.resolveStartupNotice(name);

    this.logger.log(`Provedor de IA ativo: ${name}${pending}.`);
  }

  enrichContent(input: EnrichContentInput): Promise<EnrichContentOutput> {
    return this.registry[this.resolveProviderName()].enrichContent(input);
  }

  /**
   * Modelo configurado via `LLM_MODEL` (override global), ou `null` quando não
   * definido — nesse caso cada provedor usa seu modelo padrão. Serve para
   * registrar no enriquecimento qual modelo foi solicitado; nunca expõe chaves.
   */
  resolveModelName(): string | null {
    return process.env.LLM_MODEL?.trim() || null;
  }

  resolveProviderName(): LlmProviderName {
    const configured = process.env.LLM_PROVIDER?.trim().toLowerCase();

    if (!configured || configured === 'mock') {
      return DEFAULT_LLM_PROVIDER;
    }

    if (
      configured === 'deepseek' ||
      configured === 'gemini' ||
      configured === 'openrouter' ||
      configured === 'ollama'
    ) {
      return configured;
    }

    throw new InvalidLlmProviderError(configured);
  }

  private resolveStartupNotice(name: LlmProviderName): string {
    if (name === 'deepseek' && !this.isConfigured(name)) {
      return ' (sem DEEPSEEK_API_KEY — as chamadas falharão até a chave ser configurada)';
    }

    if (name === 'gemini' && !this.isConfigured(name)) {
      return ' (sem GEMINI_API_KEY — as chamadas falharão até a chave ser configurada)';
    }

    if (name === 'openrouter' || name === 'ollama') {
      return ' (não implementado — as chamadas falharão)';
    }

    return '';
  }

  private isConfigured(name: LlmProviderName): boolean {
    const provider = this.registry[name];

    return (
      'isConfigured' in provider &&
      typeof provider.isConfigured === 'function' &&
      provider.isConfigured() === true
    );
  }
}
