// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from "path";
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';
import { viteStaticCopy } from 'vite-plugin-static-copy';

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
    }),
    react({
      // We are not using React, so we use the 'classic' runtime
      // which allows for custom factory functions like yours.
      jsxRuntime: 'classic',
      jsxImportSource: ".",

      // This is the key: we override the default babel config
      // to use the SolidJS-like JSX transform plugin.
      babel: {
        plugins: [
          [
            'babel-plugin-jsx-dom-expressions',
            {
              // These settings should match your babel.config.json
              moduleName: './index', // Path to your library's entry point
              delegateEvents: true,
              wrapConditionals: true,
            },
          ],
        ],
      },
    }),
  ],

  build: {
    lib: {
      entry: {
        'atomic-duck': resolve(__dirname, 'src/index.ts'),
        'jsx-runtime': resolve(__dirname, 'src/jsx-runtime.ts'),
        'jsx-dev-runtime': resolve(__dirname, 'src/jsx-dev-runtime.ts'),
      },
      //      entry: resolve(__dirname, 'src/index.ts'),
      name: 'atomic-duck',
      fileName: (format) => `atomic-duck.${format}.js`,
    },
    rollupOptions: {
      // It's a good practice to externalize any dependencies
      // that consumers of your library will also have, to avoid
      // bundling duplicates.
      external: ['csstype'],
    },
  },
  // This is also crucial. It configures Vite's dev server (esbuild)
  // to use your custom functions instead of React.createElement.
  esbuild: {
    jsxFactory: 'createElement',
    jsxFragment: 'createFragment',
  },
});
