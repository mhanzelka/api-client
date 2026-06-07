import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    build: {
        emptyOutDir: true,
        target: "es2020",
        sourcemap: true,
        minify: false,
        lib: {
            entry: "src/index.ts",
            formats: ["es"],
            fileName: () => "index.js"
        }
    },
    plugins: [
        dts({
            entryRoot: "src",
            outDir: "dist",
            rollupTypes: true,
            include: ["src"]
        })
    ]
});
