// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from "path";
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export default defineConfig({
  plugins: [
    dts({
      entryRoot: 'src',
      outDir: 'dist',
      rollupTypes: true,
    }),
    viteStaticCopy({
      targets: [
        {
          src: 'src/jsx.d.ts',
          dest: '.',
        },
      ],
    }),
    react({
      // Switch to the 'automatic' runtime. This is what dom-expressions is designed for.
      jsxRuntime: 'automatic',
      // This should be the name of your package.
      // It tells the transformer what to import from.
      jsxImportSource: 'atomic-duck', 

      // Configure Babel to use dom-expressions
      babel: {
        plugins: [
          [
            'babel-plugin-jsx-dom-expressions',
            {
              // This is the import path for the runtime helpers.
              // The compiled output will have `import { ... } from "atomic-duck/jsx-runtime"`
              moduleName: 'atomic-duck/jsx-runtime',
              // Keep your other desired settings
              delegateEvents: true,
              wrapConditionals: true,
              contextToCustomElements: true,
              builtIns: [
                "For",
                "Show",
                "Switch",
                "Match",
                "Suspense",
                "SuspenseList",
                "Portal",
                "Index",
                "Dynamic",
                "ErrorBoundary"
              ]
            },
          ],
        ],
      },
    }),
  ],

  build: {
    lib: {
      // Your multi-entry setup is correct!
      entry: {
        'index': resolve(__dirname, 'src/index.ts'),
        'jsx-runtime': resolve(__dirname, 'src/jsx-runtime.ts'),
      },
      // Use a function to dynamically name output files
      fileName: (format, entryName) => `${entryName}.${format}.js`,
      // Output formats
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['csstype'],
    },
  },

  // **CRITICAL:** Remove the esbuild jsx configuration entirely.
  // We want Babel to handle JSX, not esbuild.
  // esbuild: { ... }, // <--- DELETE THIS BLOCK

  // Add a resolve alias for development.
  // This tells Vite's dev server that whenever it sees an import for "atomic-duck/jsx-runtime",
  // it should load your local `src/jsx-runtime.ts` file.
  resolve: {
    alias: {
      'atomic-duck/jsx-runtime': resolve(__dirname, 'src/jsx-runtime.ts'),
      'atomic-duck': resolve(__dirname, 'src/index.ts'),
    }
  }
});

