import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['legacy/**', 'src/generated/**', '.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
];

export default config;
