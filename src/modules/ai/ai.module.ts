import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { LLM_PROVIDER_REGISTRY, LlmProviderRegistry } from './ai.tokens';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { LlmProvider } from './providers/llm-provider.interface';
import { MockLlmProvider } from './providers/mock-llm.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

/**
 * Camada de IA do minutoDev.
 *
 * Exporta apenas o `AiService` (a fachada). Os provedores concretos
 * (mock/DeepSeek) ficam encapsulados; outros módulos dependem só da fachada e
 * do contrato `LlmProvider`, nunca de um provedor específico.
 */
@Module({
  providers: [
    AiService,
    MockLlmProvider,
    DeepSeekProvider,
    GeminiProvider,
    OpenRouterProvider,
    OllamaProvider,
    {
      provide: LLM_PROVIDER_REGISTRY,
      inject: [
        MockLlmProvider,
        DeepSeekProvider,
        GeminiProvider,
        OpenRouterProvider,
        OllamaProvider,
      ],
      useFactory: (
        mock: LlmProvider,
        deepseek: LlmProvider,
        gemini: LlmProvider,
        openrouter: LlmProvider,
        ollama: LlmProvider,
      ): LlmProviderRegistry => ({
        mock,
        deepseek,
        gemini,
        openrouter,
        ollama,
      }),
    },
  ],
  exports: [AiService],
})
export class AiModule {}
