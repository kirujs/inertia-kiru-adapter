import { defineConfig } from 'vite'
import kaioken from "vite-plugin-kiru"
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: ['./lib/main.tsx'],
      name: 'inertia-kiru',
      fileName: (extension, name) => extension === 'es'  ? `${name}.js` : `${name}.${extension}.js`,
    },

    rollupOptions: {
      external: ['kiru', 'kiru/ssr/client', '@inertiajs/core'],
    },
  },
  plugins: [kaioken(), dts({
    //  rollupTypes: false,
    exclude: ['vite.config.ts']
  })]
})
