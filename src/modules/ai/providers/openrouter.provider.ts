import { Injectable } from '@nestjs/common';

import { NotImplementedProviderError } from '../ai.errors';
import {
  EnrichContentInput,
  EnrichContentOutput,
  LlmProvider,
} from './llm-provider.interface';

@Injectable()
export class OpenRouterProvider implements LlmProvider {
  enrichContent(_input: EnrichContentInput): Promise<EnrichContentOutput> {
    void _input;

    return Promise.reject(new NotImplementedProviderError('openrouter'));
  }
}
