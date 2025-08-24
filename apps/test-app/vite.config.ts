import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // This is where you configure Babel
      babel: {
        plugins: [
          [
            'babel-plugin-jsx-dom-expressions',
            {
              moduleName: 'atomic-duck',
              // delegateEvents: true, // Uncomment if you need this option
              // wrapConditionals: true, // Uncomment if you need this option
            },
          ],
        ],
      },
      // You can also specify the JSX runtime here, but the babel config above should handle it
      // jsxRuntime: 'classic' // This might be needed depending on the library
    }),
  ],
  resolve: {
    alias: {
      'atomic-duck/jsx-dev-runtime': 'atomic-duck',
    },
  }
});

