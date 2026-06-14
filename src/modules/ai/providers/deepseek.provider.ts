import { Injectable, Logger } from '@nestjs/common';

import { resolveLlmModel, resolveLlmTimeoutMs } from '../llm-config.util';
import {
  buildEnrichmentMessages,
  parseEnrichmentResponse,
} from '../prompts/enrichment.prompt';
import {
  EnrichContentInput,
  EnrichContentOutput,
  LlmProvider,
} from './llm-provider.interface';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

/** Subconjunto da resposta do endpoint OpenAI-compatible do DeepSeek. */
interface DeepSeekChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Provedor de IA via DeepSeek (API compatível com o formato OpenAI).
 *
 * Lê toda a configuração de variáveis de ambiente (a chave nunca é hardcoded
 * nem logada). O provedor pode ser instanciado mesmo sem chave — só falha, com
 * mensagem clara, no momento em que `enrichContent` é efetivamente chamado.
 * Assim o projeto roda sem chave e nenhum custo é gerado sem ação explícita.
 */
@Injectable()
export class DeepSeekProvider implements LlmProvider {
  private readonly logger = new Logger(DeepSeekProvider.name);

  isConfigured(): boolean {
    return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  }

  async enrichContent(input: EnrichContentInput): Promise<EnrichContentOutput> {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        'DEEPSEEK_API_KEY não configurada. Defina a chave para usar o provedor DeepSeek ou use LLM_PROVIDER=mock.',
      );
    }

    const baseUrl = process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL;
    const model = resolveLlmModel('deepseek-chat');
    const timeoutMs = resolveLlmTimeoutMs();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: buildEnrichmentMessages(input),
          response_format: { type: 'json_object' },
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Logamos apenas a causa — nunca a API key, os headers ou o corpo.
      const reason = this.describeError(error);
      this.logger.error(`Falha ao contatar o DeepSeek: ${reason}`);
      throw new Error(
        `Não foi possível contatar o provedor DeepSeek: ${reason}`,
      );
    }

    if (!response.ok) {
      this.logger.error(
        `DeepSeek respondeu com status HTTP ${response.status}.`,
      );
      throw new Error(
        `Provedor DeepSeek respondeu com status HTTP ${response.status}.`,
      );
    }

    const data = (await response.json()) as DeepSeekChatCompletion;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Resposta do DeepSeek não contém conteúdo.');
    }

    return parseEnrichmentResponse(content);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      // AbortSignal.timeout dispara um erro nomeado 'TimeoutError'.
      return error.name === 'TimeoutError'
        ? 'tempo limite excedido'
        : error.message;
    }

    return 'erro desconhecido';
  }
}
