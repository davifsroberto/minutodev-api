import { Injectable, Logger } from '@nestjs/common';

import { TransientAiError } from '../ai.errors';
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

/** Resiliência a falhas transitórias (rate limit/5xx/timeout). */
export const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;
/** Espera máxima por tentativa: acima disto não bloqueamos (ex.: quota de ~60s). */
const RETRY_CAP_MS = 4_000;
/** Status HTTP transitórios que valem nova tentativa (5xx). */
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

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
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ '@type'?: string; retryDelay?: string }>;
  };
}

type Attempt =
  | { kind: 'ok'; output: EnrichContentOutput }
  | { kind: 'permanent'; error: Error }
  | { kind: 'transient'; error: TransientAiError; retryable: boolean };

/**
 * Provedor de IA via Google Gemini (Generative Language API, REST).
 *
 * Lê toda a configuração de variáveis de ambiente — a chave (`GEMINI_API_KEY`)
 * nunca é hardcoded nem logada. O provedor é instanciável sem chave: só falha,
 * com mensagem clara, quando `enrichContent` é efetivamente chamado.
 *
 * Falhas transitórias (rate limit 429 com janela curta, 5xx, timeout, rede) são
 * reexecutadas com backoff limitado e, se persistirem, sobem como
 * `TransientAiError` — para o chamador manter o registro retryável em vez de
 * marcá-lo como falho permanente. Erros definitivos (4xx, bloqueio de segurança,
 * resposta truncada/ inválida) sobem como `Error` comum.
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
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: ENRICHMENT_SYSTEM_PROMPT }] },
      contents: [
        { role: 'user', parts: [{ text: buildEnrichmentUserPrompt(input) }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        // Briefing editorial é mais longo (várias seções + conteúdo detalhado)
        // e os tokens de "thinking" do 2.5-flash também contam aqui.
        maxOutputTokens: 8192,
      },
    });

    let lastTransient: TransientAiError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const outcome = await this.attempt(url, apiKey, body, timeoutMs);

      if (outcome.kind === 'ok') return outcome.output;
      if (outcome.kind === 'permanent') throw outcome.error;

      lastTransient = outcome.error;
      const waitMs =
        outcome.error.retryAfterMs ?? RETRY_BASE_MS * 2 ** (attempt - 1);

      if (
        attempt < MAX_ATTEMPTS &&
        outcome.retryable &&
        waitMs <= RETRY_CAP_MS
      ) {
        this.logger.warn(
          `Gemini transitório (tentativa ${attempt}/${MAX_ATTEMPTS}); nova tentativa em ${waitMs}ms.`,
        );
        await this.sleep(waitMs);
        continue;
      }

      break;
    }

    throw (
      lastTransient ??
      new TransientAiError('Falha transitória ao contatar o provedor Gemini.')
    );
  }

  /** Uma tentativa de chamada; classifica o resultado em ok/permanente/transitório. */
  private async attempt(
    url: string,
    apiKey: string,
    body: string,
    timeoutMs: number,
  ): Promise<Attempt> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forma recomendada pela doc oficial; mantém a chave fora da URL.
          'x-goog-api-key': apiKey,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Rede/timeout são transitórios. Logamos apenas a causa — nunca a chave.
      const reason = this.describeError(error);
      this.logger.error(`Falha ao contatar o Gemini: ${reason}`);

      return {
        kind: 'transient',
        retryable: true,
        error: new TransientAiError(
          `Não foi possível contatar o provedor Gemini: ${reason}`,
        ),
      };
    }

    if (!response.ok) {
      return this.classifyHttpError(response);
    }

    let data: GeminiGenerateContentResponse;
    try {
      data = (await response.json()) as GeminiGenerateContentResponse;
    } catch {
      return {
        kind: 'permanent',
        error: new Error(
          'Resposta do Gemini não é um JSON válido (corpo inesperado).',
        ),
      };
    }

    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      return {
        kind: 'permanent',
        error: new Error(
          `Geração bloqueada pelo Gemini (motivo: ${blockReason}).`,
        ),
      };
    }

    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const content = candidate?.content?.parts?.[0]?.text;

    if (!content) {
      const finish = finishReason ? ` (finishReason: ${finishReason})` : '';

      return {
        kind: 'permanent',
        error: new Error(`Resposta do Gemini não contém conteúdo${finish}.`),
      };
    }

    // MAX_TOKENS/SAFETY/RECITATION podem vir com texto PARCIAL — o JSON estaria
    // truncado. Falhamos com a causa real, em vez do erro genérico de parse.
    if (finishReason && finishReason !== 'STOP') {
      return {
        kind: 'permanent',
        error: new Error(
          `Geração do Gemini interrompida (finishReason: ${finishReason}); a resposta pode estar truncada.`,
        ),
      };
    }

    try {
      return { kind: 'ok', output: parseEnrichmentResponse(content) };
    } catch (error) {
      return {
        kind: 'permanent',
        error: error instanceof Error ? error : new Error('Falha ao parsear.'),
      };
    }
  }

  /**
   * Classifica uma resposta HTTP de falha. 429 é rate limit: só vale repetir se
   * a janela informada for curta (`retryDelay`/`Retry-After` ≤ teto); 5xx é
   * transitório com backoff; demais (4xx) são definitivos.
   */
  private async classifyHttpError(response: Response): Promise<Attempt> {
    const { text, retryAfterMs } = await this.safeErrorDetail(response);
    this.logger.error(`Gemini respondeu com status HTTP ${response.status}.`);

    const message = `Provedor Gemini respondeu com status HTTP ${response.status}${text}.`;

    if (response.status === 429) {
      const retryable =
        retryAfterMs !== undefined && retryAfterMs <= RETRY_CAP_MS;

      return {
        kind: 'transient',
        retryable,
        error: new TransientAiError(message, retryAfterMs),
      };
    }

    if (RETRYABLE_STATUSES.has(response.status)) {
      return {
        kind: 'transient',
        retryable: true,
        error: new TransientAiError(message),
      };
    }

    return { kind: 'permanent', error: new Error(message) };
  }

  /**
   * Lê de forma defensiva o corpo de erro do Google para enriquecer a mensagem e
   * extrair a janela de retry. O corpo nunca contém a API key, então
   * `status`/`message` são seguros de propagar; um corpo não-JSON é ignorado.
   */
  private async safeErrorDetail(
    response: Response,
  ): Promise<{ text: string; retryAfterMs?: number }> {
    const headerMs = this.retryAfterHeaderMs(response);

    try {
      const body = (await response.json()) as GeminiErrorResponse;
      const parts = [body.error?.status, body.error?.message].filter(
        (part): part is string => Boolean(part),
      );
      const text = parts.length ? ` (${parts.join(': ')})` : '';

      return { text, retryAfterMs: headerMs ?? this.retryDelayFromBody(body) };
    } catch {
      return { text: '', retryAfterMs: headerMs };
    }
  }

  private retryAfterHeaderMs(response: Response): number | undefined {
    const raw = response.headers?.get?.('retry-after');
    if (!raw) return undefined;

    const seconds = Number(raw);

    return Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : undefined;
  }

  /** Lê o `retryDelay` (ex.: "59s") do detalhe RetryInfo do google.rpc.Status. */
  private retryDelayFromBody(body: GeminiErrorResponse): number | undefined {
    const delay = body.error?.details?.find(
      (detail) => detail.retryDelay,
    )?.retryDelay;
    if (!delay) return undefined;

    const seconds = Number(delay.replace(/s$/, ''));

    return Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
