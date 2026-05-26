import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  plugins: [
    {
      name: 'copy-scripts',
      closeBundle() {
        // Copy the vanilla JS files that are not bundled
        const files = ['wiki-path.js', 'card-swipe.js', 'app.js'];
        files.forEach(file => {
          copyFileSync(file, join('dist', file));
        });
      }
    }
  ]
});
