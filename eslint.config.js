import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/', 'supabase/', 'nueva-integracion/', 'index-reloj.html'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  // Desactiva reglas de estilo que se pisan con Prettier (va último)
  prettier,
];
