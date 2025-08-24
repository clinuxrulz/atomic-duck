// test-app/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from "path";
import { fileURLToPath } from 'url';

// Helper to get the current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export default defineConfig({
  plugins: [
    react({
      // Use the 'automatic' runtime, which dom-expressions is built for.
      jsxRuntime: 'automatic',
      // This tells the transformer which library is providing the runtime.
      jsxImportSource: 'atomic-duck',

      // Configure Babel to use the dom-expressions plugin.
      babel: {
        plugins: [
          [
            'babel-plugin-jsx-dom-expressions',
            {
              // The compiled code will import helpers from this module path.
              moduleName: 'atomic-duck/jsx-runtime',
              delegateEvents: true,
              wrapConditionals: true,
            },
          ],
        ],
      },
    }),
  ],

  // **CRITICAL:** Remove the esbuild configuration to prevent it from
  // transforming JSX before Babel gets to see it.
  // esbuild: { ... }, // <-- DELETE THIS ENTIRE BLOCK

  // **CRITICAL for Monorepos:** Use aliases to point imports directly to the
  // source code of your library package. This enables hot-reloading.
  resolve: {
    alias: {
      // When your code imports from "atomic-duck/jsx-runtime",
      // Vite will load the source file from your library package.
      'atomic-duck/jsx-runtime': resolve(__dirname, '../../src/jsx-runtime.ts'),

      // When your code imports from "atomic-duck",
      // Vite will load the main entry source file.
      'atomic-duck': resolve(__dirname, '../../src/index.ts'),
    },
  },
});

