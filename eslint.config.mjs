import next from 'eslint-config-next';

const config = [
  ...next,
  {
    // Ohne React Compiler: manuelle useMemo/useCallback sind gewollt
    rules: { 'react-hooks/preserve-manual-memoization': 'off' },
  },
  { ignores: ['legacy/**', 'src/generated/**', '.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
];

export default config;
