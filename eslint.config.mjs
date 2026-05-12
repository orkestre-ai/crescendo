import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'warn',
      'no-console': 'error',
    },
  }),
  // Logging internals — allowed to use console
  {
    files: ['src/lib/logging/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  // Client logger — uses console by design
  {
    files: ['src/lib/client-logger.ts'],
    rules: { 'no-console': 'off' },
  },
  // Dev scripts and CLI tools — allowed to use console
  {
    files: ['src/scripts/**/*.ts', 'src/cli/**/*.ts', 'prisma/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  // Client components — gradual migration (warn, not error)
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: { 'no-console': 'warn' },
  },
  // Config files — CommonJS require is expected
  {
    files: ['next.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    ignores: [
      '**/node_modules/',
      '**/.next/',
      '**/out/',
      '**/dist/',
      '**/build/',
      '**/coverage/',
      '**/*.min.js',
      '**/*.bundle.js',
      'node_modules/@prisma/',
      '**/.env*',
      '**/.vercel/',
      '**/.vscode/',
      '**/.idea/',
      // Auto-generated files
      'next-env.d.ts',
      // Test/utility scripts (allowed to use require and console.log)
      'src/scripts/**/*.js',
      // Internal and backup directories
      '**/backup/',
      '**/.planning/',
      '**/.conversations/',
      '**/.claude/',
    ],
  },
];

export default eslintConfig;
