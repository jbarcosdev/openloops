import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  clean: true,
  bundle: false,
  tsconfig: './tsconfig.json',
  onSuccess: 'tsc --emitDeclarationOnly',
})
