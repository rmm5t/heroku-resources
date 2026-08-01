import eslint from '@eslint/js'

export default [
  {ignores: ['dist', 'oclif.manifest.json']},
  eslint.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        process: 'readonly',
      },
      sourceType: 'module',
    },
  },
]
