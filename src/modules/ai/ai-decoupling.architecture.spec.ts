import { execFileSync } from 'node:child_process';
import {
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

type ImportViolation = {
  filePath: string;
  specifier: string;
};

type LintMessage = {
  ruleId: string | null;
};

type LintResult = {
  messages: LintMessage[];
};

type ExecFileError = Error & {
  stdout?: Buffer | string;
};

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, 'src');
const modulesRoot = path.join(srcRoot, 'modules');
const aiModuleRoot = path.join(modulesRoot, 'ai');
const aiProvidersRoot = path.join(aiModuleRoot, 'providers');

const importSpecifierPattern =
  /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;

function toRelativeProjectPath(filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

function isInsidePath(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function isAiProviderSpecifier(
  specifier: string,
  importerPath: string,
): boolean {
  if (specifier.startsWith('@src/')) {
    return isInsidePath(
      path.resolve(srcRoot, specifier.slice('@src/'.length)),
      aiProvidersRoot,
    );
  }

  if (specifier.startsWith('src/')) {
    return isInsidePath(path.resolve(projectRoot, specifier), aiProvidersRoot);
  }

  if (specifier.startsWith('.')) {
    return isInsidePath(
      path.resolve(path.dirname(importerPath), specifier),
      aiProvidersRoot,
    );
  }

  return /(^|\/)ai\/providers(\/|$)/.test(specifier);
}

function findAiProviderImportViolationsInSource(
  source: string,
  filePath: string,
): ImportViolation[] {
  return [...source.matchAll(importSpecifierPattern)]
    .map((match) => match[1] ?? match[2])
    .filter((specifier) => isAiProviderSpecifier(specifier, filePath))
    .map((specifier) => ({ filePath, specifier }));
}

function listTypescriptFilesOutsideAi(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);

    if (entryPath === aiModuleRoot) {
      return [];
    }

    if (statSync(entryPath).isDirectory()) {
      return listTypescriptFilesOutsideAi(entryPath);
    }

    return entryPath.endsWith('.ts') ? [entryPath] : [];
  });
}

function collectAiProviderImportViolations(): ImportViolation[] {
  return listTypescriptFilesOutsideAi(modulesRoot).flatMap((filePath) =>
    findAiProviderImportViolationsInSource(
      readFileSync(filePath, 'utf8'),
      filePath,
    ),
  );
}

function expectNoAiProviderImportViolations(
  violations: ImportViolation[],
): void {
  if (violations.length === 0) {
    expect(violations).toEqual([]);
    return;
  }

  const message = [
    'Business modules must depend on AiService, not concrete AI providers.',
    ...violations.map(
      ({ filePath, specifier }) =>
        `- ${toRelativeProjectPath(filePath)} imports ${specifier}`,
    ),
  ].join('\n');

  throw new Error(message);
}

function lintFixture(filePath: string, code: string): LintResult {
  const args = ['eslint', filePath, '--format', 'json'];
  let output: Buffer | string;

  try {
    writeFileSync(filePath, code);
    output = execFileSync('npx', args, {
      cwd: projectRoot,
      encoding: 'utf8',
    });
  } catch (error) {
    output = (error as ExecFileError).stdout ?? '';
  } finally {
    unlinkSync(filePath);
  }

  return (JSON.parse(output.toString()) as LintResult[])[0];
}

describe('AI provider decoupling architecture guardrail', () => {
  it('finds no business module imports from ai/providers in the source tree', () => {
    expectNoAiProviderImportViolations(collectAiProviderImportViolations());
  });

  it('reports relative imports from business modules to ai/providers', () => {
    const filePath = path.join(modulesRoot, 'contents', 'offender.ts');
    const violations = findAiProviderImportViolationsInSource(
      "import { LlmProvider } from '../ai/providers/llm-provider.interface';",
      filePath,
    );

    expect(violations).toEqual([
      {
        filePath,
        specifier: '../ai/providers/llm-provider.interface',
      },
    ]);
  });

  it('reports @src alias imports from business modules to ai/providers', () => {
    const filePath = path.join(modulesRoot, 'contents', 'offender.ts');
    const violations = findAiProviderImportViolationsInSource(
      "import { DeepSeekProvider } from '@src/modules/ai/providers/deepseek.provider';",
      filePath,
    );

    expect(violations).toEqual([
      {
        filePath,
        specifier: '@src/modules/ai/providers/deepseek.provider',
      },
    ]);
  });

  it('does not scan the AI module itself', () => {
    const scannedFiles = listTypescriptFilesOutsideAi(modulesRoot);

    expect(
      scannedFiles.some((filePath) => isInsidePath(filePath, aiModuleRoot)),
    ).toBe(false);
  });

  it('names offending file paths in the failure message', () => {
    const filePath = path.join(modulesRoot, 'contents', 'offender.ts');

    expect(() =>
      expectNoAiProviderImportViolations([
        {
          filePath,
          specifier: '../ai/providers/deepseek.provider',
        },
      ]),
    ).toThrow(toRelativeProjectPath(filePath));
  });

  it('has an ESLint rule that rejects provider imports from business modules', () => {
    const result = lintFixture(
      path.join(modulesRoot, 'contents', '__ai_provider_eslint_fixture__.ts'),
      "import { DeepSeekProvider } from '../ai/providers/deepseek.provider';\n",
    );

    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'no-restricted-imports',
        }),
      ]),
    );
  });

  it('allows provider imports from inside the AI module', () => {
    const result = lintFixture(
      path.join(aiModuleRoot, '__ai_provider_eslint_fixture__.ts'),
      "import { DeepSeekProvider } from './providers/deepseek.provider';\n",
    );

    expect(
      result.messages.filter(
        (message) => message.ruleId === 'no-restricted-imports',
      ),
    ).toEqual([]);
  });
});
