// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
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

  // This is also crucial. It configures Vite's dev server (esbuild)
  // to use your custom functions instead of React.createElement.
  esbuild: {
    jsxFactory: '_createElement',
    jsxFragment: '_createFragment',
  },
});
