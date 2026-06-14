import { EnrichContentInput } from '../providers/llm-provider.interface';
import {
  buildEnrichmentMessages,
  buildEnrichmentUserPrompt,
  ENRICHMENT_SYSTEM_PROMPT,
  parseEnrichmentResponse,
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
  shortSummary: 'Resumo curto.',
  whyItMatters: 'Importa porque melhora o compilador.',
  keyPoints: ['Ponto 1', 'Ponto 2'],
  briefContent: 'Conteúdo breve e original.',
};

describe('enrichment.prompt', () => {
  describe('ENRICHMENT_SYSTEM_PROMPT', () => {
    it('instrui pt-BR, conteúdo original e saída JSON para desenvolvedores', () => {
      expect(ENRICHMENT_SYSTEM_PROMPT).toContain('português do Brasil');
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(/NÃO copie/);
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(/original/i);
      expect(ENRICHMENT_SYSTEM_PROMPT).toContain('desenvolvedores');
      expect(ENRICHMENT_SYSTEM_PROMPT).toMatch(/JSON/);

      for (const key of [
        'translatedTitle',
        'shortSummary',
        'whyItMatters',
        'keyPoints',
        'briefContent',
      ]) {
        expect(ENRICHMENT_SYSTEM_PROMPT).toContain(key);
      }
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

    it('descarta campos extras, retornando apenas o contrato', () => {
      const raw = JSON.stringify({ ...validOutput, extra: 'ignorado' });

      expect(parseEnrichmentResponse(raw)).toEqual(validOutput);
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
