import eslint from '@eslint/js'

export default [
  {ignores: ['dist', 'oclif.manifest.json']},
  eslint.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
      sourceType: 'module',
    },
  },
]
