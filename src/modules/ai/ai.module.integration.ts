import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { InvalidLlmProviderError } from './ai.errors';
import { AiModule } from './ai.module';
import { AiService } from './ai.service';

describe('AiModule boot integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('inicializa com mock quando o ambiente de IA está vazio', async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;

    const app = await createAiApp();

    try {
      await expect(app.init()).resolves.toBeDefined();
      expect(app.get(AiService).resolveProviderName()).toBe('mock');
    } finally {
      await app.close();
    }
  });

  it('aborta o boot quando LLM_PROVIDER é inválido', async () => {
    process.env.LLM_PROVIDER = 'not-a-provider';

    const app = await createAiApp();

    try {
      await expect(app.init()).rejects.toThrow(InvalidLlmProviderError);
    } finally {
      await app.close();
    }
  });
});

async function createAiApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AiModule],
  }).compile();

  return moduleFixture.createNestApplication();
}
