/**
 * The extension's bundle: one ES module, `dist/main.js`, exporting `activate`, and one stylesheet,
 * `dist/main.css`, which the Client adopts into the shadow root each video is drawn in. The
 * Extension API is imported for its types only, so nothing of it lands in the bundle.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
    build: {
        lib: {
            entry: 'src/main.ts',
            formats: ['es'],
            fileName: () => 'main.js',
            cssFileName: 'main',
        },
        cssCodeSplit: false,
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        target: 'es2022',
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
})
