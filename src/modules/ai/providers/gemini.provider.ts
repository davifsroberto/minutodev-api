import { Injectable, Logger } from '@nestjs/common';

import { resolveLlmModel, resolveLlmTimeoutMs } from '../llm-config.util';
import {
  buildEnrichmentUserPrompt,
  ENRICHMENT_SYSTEM_PROMPT,
  parseEnrichmentResponse,
} from '../prompts/enrichment.prompt';
import {
  EnrichContentInput,
  EnrichContentOutput,
  LlmProvider,
} from './llm-provider.interface';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Subconjunto da resposta do endpoint generateContent (Google AI). */
interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

/** Erro canônico google.rpc.Status retornado em respostas HTTP de falha. */
interface GeminiErrorResponse {
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Provedor de IA via Google Gemini (Generative Language API, REST).
 *
 * Lê toda a configuração de variáveis de ambiente — a chave (`GEMINI_API_KEY`)
 * nunca é hardcoded nem logada. O provedor é instanciável sem chave: só falha,
 * com mensagem clara, quando `enrichContent` é efetivamente chamado. Assim o
 * projeto roda sem chave e nenhum custo é gerado sem ação explícita.
 *
 * O formato de mensagens do Gemini difere do padrão OpenAI/DeepSeek, então
 * reaproveitamos o prompt de enriquecimento mapeando o sistema para
 * `systemInstruction` e o usuário para `contents` (role `user`). A resposta vem
 * como string JSON em `candidates[0].content.parts[0].text`, validada pelo
 * mesmo `parseEnrichmentResponse` dos demais provedores.
 */
@Injectable()
export class GeminiProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  }

  async enrichContent(input: EnrichContentInput): Promise<EnrichContentOutput> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY não configurada. Defina a chave para usar o provedor Gemini ou use LLM_PROVIDER=mock.',
      );
    }

    const baseUrl = process.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL;
    const model = resolveLlmModel(DEFAULT_MODEL);
    const timeoutMs = resolveLlmTimeoutMs();
    const url = `${baseUrl}/models/${model}:generateContent`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forma recomendada pela doc oficial; mantém a chave fora da URL.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: ENRICHMENT_SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: buildEnrichmentUserPrompt(input) }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            // Folga ampla: os tokens de "thinking" do 2.5-flash também contam
            // aqui. Se ainda assim truncar, o finishReason é tratado abaixo.
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Logamos apenas a causa — nunca a API key, os headers ou o corpo.
      const reason = this.describeError(error);
      this.logger.error(`Falha ao contatar o Gemini: ${reason}`);
      throw new Error(`Não foi possível contatar o provedor Gemini: ${reason}`);
    }

    if (!response.ok) {
      const detail = await this.safeErrorDetail(response);
      this.logger.error(`Gemini respondeu com status HTTP ${response.status}.`);
      throw new Error(
        `Provedor Gemini respondeu com status HTTP ${response.status}${detail}.`,
      );
    }

    let data: GeminiGenerateContentResponse;
    try {
      data = (await response.json()) as GeminiGenerateContentResponse;
    } catch {
      throw new Error(
        'Resposta do Gemini não é um JSON válido (corpo inesperado).',
      );
    }

    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(
        `Geração bloqueada pelo Gemini (motivo: ${blockReason}).`,
      );
    }

    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const content = candidate?.content?.parts?.[0]?.text;

    if (!content) {
      const finish = finishReason ? ` (finishReason: ${finishReason})` : '';
      throw new Error(`Resposta do Gemini não contém conteúdo${finish}.`);
    }

    // MAX_TOKENS/SAFETY/RECITATION podem vir com texto PARCIAL — o JSON estaria
    // truncado. Falhamos com a causa real, em vez do erro genérico de parse.
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(
        `Geração do Gemini interrompida (finishReason: ${finishReason}); a resposta pode estar truncada.`,
      );
    }

    return parseEnrichmentResponse(content);
  }

  /**
   * Lê de forma defensiva o corpo de erro do Google para enriquecer a mensagem.
   * O corpo nunca contém a API key, então `status`/`message` são seguros de
   * propagar; um corpo não-JSON é simplesmente ignorado.
   */
  private async safeErrorDetail(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as GeminiErrorResponse;
      const parts = [body.error?.status, body.error?.message].filter(
        (part): part is string => Boolean(part),
      );

      return parts.length ? ` (${parts.join(': ')})` : '';
    } catch {
      return '';
    }
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
