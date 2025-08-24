// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from "path";
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { build } from 'vite';

// Convert import.meta.url to a file path and get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export default defineConfig({
  plugins: [
    dts({
      // Specifies the root directory for your TypeScript source files
      entryRoot: 'src',
      // Specifies the output directory for the declaration files
      outDir: 'dist',
      // Optional: Merges all declaration files into a single file
      rollupTypes: true,
      compilerOptions: {
        // This option is needed when rollupTypes is true to set the output name
        declarationMap: false,
        declarationDir: './dist',
      },
    }),
    viteStaticCopy({
      targets: [
        {
          src: 'src/jsx.d.ts',
          dest: '.',
        },
      ],
    }),/*
    react({
      jsxRuntime: 'classic',
      jsxImportSource: ".",
    }),*/
  ],
  resolve: {
    alias: {
      // ✅ This is the correct way to replace the import path
      'rxcore': resolve(__dirname, 'src/core'),
    },
  },
  build: {
    minify: false,
    lib: {
      entry: "src/index.ts",
      name: "AtomicDuck",
      fileName: (format) => `atomic-duck.${format}.js`,
    },
  },
});
