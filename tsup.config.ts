import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'services/agent/core/index': 'src/services/agent/core/index.ts',
    'services/agent/skills/index': 'src/services/agent/skills/index.ts',
    'services/agent/tools/index': 'src/services/agent/tools/index.ts',
    'services/agent/loops/index': 'src/services/agent/loops/index.ts',
    'services/app/core/index': 'src/services/app/core/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
});
