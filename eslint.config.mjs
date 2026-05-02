import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dbt_project/**',
      'graveyard/**',
      'media/vendor/**',
      'node_modules/**',
      'out/**',
      '*.vsix'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-empty-function': 'off'
    }
  },
  {
    files: ['media/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        acquireVsCodeApi: 'readonly'
      }
    }
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    }
  }
);
