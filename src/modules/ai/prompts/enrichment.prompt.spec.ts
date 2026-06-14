import { EnrichContentInput } from '../providers/llm-provider.interface';
import {
  buildEnrichmentMessages,
  buildEnrichmentUserPrompt,
  ENRICHMENT_SYSTEM_PROMPT,
  parseEnrichmentResponse,
  SOURCE_CONTENT_MAX_CHARS,
} from './enrichment.prompt';

const baseInput: EnrichContentInput = {
  title: 'TypeScript 5.7 released',
  summary: 'Compiler improvements and new utility types.',
  url: 'https://example.com/ts-5-7',
  sourceName: 'TypeScript Blog',
  language: 'pt-BR',
};

const validOutput = {
  translatedTitle: 'TypeScript 5.7 lançado',
  summary30s: 'Saiu o TS 5.7. Builds mais rápidas. Vale para quem mantém TS.',
  shortSummary: 'Resumo curto.',
  whyItMatters: 'Importa porque melhora o compilador.',
  keyInsight: 'O ganho real está no tempo de feedback do compilador.',
  keyPoints: ['Ponto 1', 'Ponto 2'],
  example: 'tsc --noEmit roda 20% mais rápido.',
  whenToUse: 'Vale a pena em monorepos grandes.',
  audienceFor: ['Backend', 'Ferramentas'],
  audienceIgnore: ['Frontend puro'],
  briefContent: 'Conteúdo breve e original.',
};

describe('enrichment.prompt', () => {
  describe('ENRICHMENT_SYSTEM_PROMPT', () => {
    it('instrui pt-BR, conteúdo original e saída JSON para desenvolvedores', () => {
      expect(ENRICHMENT_SYSTEM_PROMPT).toContain('português do Brasil');
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(/copiar o artigo/i);
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(/original/i);
      expect(ENRICHMENT_SYSTEM_PROMPT).toContain('desenvolvedores');
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(/JSON/);

      for (const key of [
        'translatedTitle',
        'summary30s',
        'shortSummary',
        'whyItMatters',
        'keyInsight',
        'keyPoints',
        'example',
        'whenToUse',
        'audienceFor',
        'audienceIgnore',
        'briefContent',
      ]) {
        expect(ENRICHMENT_SYSTEM_PROMPT).toContain(key);
      }
    });

    it('pede fatos concretos e tradução natural (não literal)', () => {
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(/concret/i);
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(/não traduza literalmente/i);
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(
        /sem (precisar )?abrir a fonte/i,
      );
    });
  });

  describe('buildEnrichmentUserPrompt', () => {
    it('inclui título, fonte, url e o resumo quando presentes', () => {
      const prompt = buildEnrichmentUserPrompt(baseInput);

      expect(prompt).toContain('TypeScript 5.7 released');
      expect(prompt).toContain('TypeScript Blog');
      expect(prompt).toContain('https://example.com/ts-5-7');
      expect(prompt).toContain('Compiler improvements');
      expect(prompt).toContain('pt-BR');
    });

    it('marca o resumo como não fornecido e omite a fonte quando ausentes', () => {
      const prompt = buildEnrichmentUserPrompt({
        ...baseInput,
        summary: null,
        sourceName: undefined,
      });

      expect(prompt).toContain('(não fornecido)');
      expect(prompt).not.toContain('Fonte:');
    });

    it('inclui o texto da fonte (sem HTML) quando fornecido', () => {
      const prompt = buildEnrichmentUserPrompt({
        ...baseInput,
        sourceContent: '<p>Detalhes <strong>concretos</strong> do artigo.</p>',
      });

      expect(prompt).toContain('Texto da fonte');
      expect(prompt).toContain('Detalhes concretos do artigo.');
      expect(prompt).not.toContain('<strong>');
    });

    it('omite o bloco de texto da fonte quando ausente', () => {
      const prompt = buildEnrichmentUserPrompt({
        ...baseInput,
        sourceContent: null,
      });

      expect(prompt).not.toContain('Texto da fonte');
    });

    it('trunca o texto da fonte no limite de caracteres', () => {
      const prompt = buildEnrichmentUserPrompt({
        ...baseInput,
        sourceContent: 'x'.repeat(SOURCE_CONTENT_MAX_CHARS + 500),
      });

      expect(prompt).toContain('…');
      expect(prompt).not.toContain('x'.repeat(SOURCE_CONTENT_MAX_CHARS + 1));
    });
  });

  describe('buildEnrichmentMessages', () => {
    it('retorna a mensagem de sistema e a do usuário, nessa ordem', () => {
      const messages = buildEnrichmentMessages(baseInput);

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        role: 'system',
        content: ENRICHMENT_SYSTEM_PROMPT,
      });
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toContain('TypeScript 5.7 released');
    });
  });

  describe('parseEnrichmentResponse', () => {
    it('parseia um JSON válido no contrato de saída', () => {
      expect(parseEnrichmentResponse(JSON.stringify(validOutput))).toEqual(
        validOutput,
      );
    });

    it('tolera blocos de código markdown ao redor do JSON', () => {
      const raw = ['```json', JSON.stringify(validOutput), '```'].join('\n');

      expect(parseEnrichmentResponse(raw)).toEqual(validOutput);
    });

    it('preserva crases triplas dentro de um valor, mesmo com cerca externa', () => {
      const output = {
        ...validOutput,
        translatedTitle: 'Use ```ts const x``` aqui',
      };
      const raw = ['```json', JSON.stringify(output), '```'].join('\n');

      expect(parseEnrichmentResponse(raw)).toEqual(output);
    });

    it('parseia JSON cru cujo valor contém crases triplas (sem cerca externa)', () => {
      const output = {
        ...validOutput,
        example: 'rode ```bash npm i``` no terminal',
      };

      expect(parseEnrichmentResponse(JSON.stringify(output))).toEqual(output);
    });

    it('descarta campos extras, retornando apenas o contrato', () => {
      const raw = JSON.stringify({ ...validOutput, extra: 'ignorado' });

      expect(parseEnrichmentResponse(raw)).toEqual(validOutput);
    });

    it('aceita campos opcionais ausentes, normalizando para null/[]', () => {
      const raw = JSON.stringify({
        translatedTitle: 'x',
        shortSummary: 'y',
        whyItMatters: 'z',
        keyPoints: ['k'],
        briefContent: 'w',
      });

      const parsed = parseEnrichmentResponse(raw);
      expect(parsed.summary30s).toBeNull();
      expect(parsed.keyInsight).toBeNull();
      expect(parsed.example).toBeNull();
      expect(parsed.whenToUse).toBeNull();
      expect(parsed.audienceFor).toEqual([]);
      expect(parsed.audienceIgnore).toEqual([]);
    });

    it('normaliza campos de texto opcionais vazios ou "null" para null', () => {
      const raw = JSON.stringify({
        ...validOutput,
        summary30s: 'null',
        keyInsight: '   ',
        example: '',
        whenToUse: 'null',
      });

      const parsed = parseEnrichmentResponse(raw);
      expect(parsed.summary30s).toBeNull();
      expect(parsed.keyInsight).toBeNull();
      expect(parsed.example).toBeNull();
      expect(parsed.whenToUse).toBeNull();
    });

    it('normaliza as listas de audiência (descarta não-strings e vazios)', () => {
      const raw = JSON.stringify({
        ...validOutput,
        audienceFor: ['Backend', '  ', 42, 'Segurança'],
        audienceIgnore: 'não é array',
      });

      const parsed = parseEnrichmentResponse(raw);
      expect(parsed.audienceFor).toEqual(['Backend', 'Segurança']);
      expect(parsed.audienceIgnore).toEqual([]);
    });

    it('lança para um JSON inválido', () => {
      expect(() => parseEnrichmentResponse('não é json')).toThrow();
    });

    it('lança quando falta um campo obrigatório', () => {
      const incomplete = {
        translatedTitle: 'x',
        shortSummary: 'y',
        keyPoints: ['z'],
        briefContent: 'w',
      };

      expect(() =>
        parseEnrichmentResponse(JSON.stringify(incomplete)),
      ).toThrow();
    });

    it('lança quando keyPoints não é um array de strings', () => {
      const raw = JSON.stringify({ ...validOutput, keyPoints: [1, 2] });

      expect(() => parseEnrichmentResponse(raw)).toThrow();
    });
  });
});
