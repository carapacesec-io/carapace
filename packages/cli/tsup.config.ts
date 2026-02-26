import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  clean: true,
  banner: {
    js: [
      "import{createRequire as __cjs_createRequire}from'module';",
      "import{fileURLToPath as __cjs_fileURLToPath}from'url';",
      "import{dirname as __cjs_dirname}from'path';",
      "const require=__cjs_createRequire(import.meta.url);",
      "const __filename=__cjs_fileURLToPath(import.meta.url);",
      "const __dirname=__cjs_dirname(__filename);",
    ].join(""),
  },
});
