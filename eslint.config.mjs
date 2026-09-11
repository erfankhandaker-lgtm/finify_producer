import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // The producer still contains legacy scaffolding with intentionally unused
      // parameters. UI packages enforce unused code strictly; backend cleanup is
      // tracked separately so enabling flat config does not make CI unusable.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
