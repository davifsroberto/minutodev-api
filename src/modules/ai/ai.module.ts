import { Module } from '@nestjs/common';

import { AiService } from './ai.service';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { MockLlmProvider } from './providers/mock-llm.provider';

/**
 * Camada de IA do minutoDev.
 *
 * Exporta apenas o `AiService` (a fachada). Os provedores concretos
 * (mock/DeepSeek) ficam encapsulados; outros módulos dependem só da fachada e
 * do contrato `LlmProvider`, nunca de um provedor específico.
 */
@Module({
  providers: [AiService, MockLlmProvider, DeepSeekProvider],
  exports: [AiService],
})
export class AiModule {}
