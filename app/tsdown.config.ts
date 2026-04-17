import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['index.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  platform: 'node',
  dts: false,
  sourcemap: true,
});
