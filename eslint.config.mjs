import eslintPluginImport from 'eslint-plugin-import';
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.eslintrc.json',
      'node_modules',
      '.vscode',
      '.dist',
      '.husky',
      '*.yml',
      'coverage',
      'documentation',
    ],
  },
  ...tseslint.configs.recommended,
  eslintPluginImport.flatConfigs.recommended,
  eslintPluginImport.flatConfigs.typescript,
  eslintPluginPrettierRecommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'no-relative-import-paths': noRelativeImportPaths,
      'simple-import-sort': simpleImportSort,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/module/shared', from: './src/module/content' },
            { target: './src/module/shared', from: './src/module/identity' },
            { target: './src/module/content', from: './src/module/identity' },
            { target: './src/module/identity', from: './src/module/content' },
          ],
        },
      ],
      'import/no-unresolved': 'off',
      'import/order': 'off',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^@nestjs'],
            ['^@prisma'],
            ['^\\w'],
            ['^@src', '^@resource'],
            ['^\\.\\.', '^\\.'],
            ['^.+\\.d\\.ts$'],
          ],
        },
      ],
    },
  },
);
