// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';


export default defineConfig({
  plugins: [
    react({
      // We are not using React, so we use the 'classic' runtime
      // which allows for custom factory functions like yours.
      jsxRuntime: 'classic',
      jsxImportSource: "atomic-duck",

      // This is the key: we override the default babel config
      // to use the SolidJS-like JSX transform plugin.
      babel: {
        plugins: [
          [
            'babel-plugin-jsx-dom-expressions',
            {
              // These settings should match your babel.config.json
              moduleName: "atomic-duck", // Path to your library's entry point
              delegateEvents: true,
              wrapConditionals: true,
            },
          ],
        ],
      },
    }),
  ],
  esbuild: {
    jsxFactory: '_createElement',
    jsxFragment: '_createFragment',
  },
});
