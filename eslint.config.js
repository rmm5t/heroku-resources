import eslint from '@eslint/js'

export default [
  {ignores: ['dist', 'oclif.manifest.json']},
  eslint.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        AbortSignal: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
      sourceType: 'module',
    },
  },
]
