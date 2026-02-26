import { defineConfig } from "tsup";
import { builtinModules } from "node:module";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  clean: true,
  platform: "node",
  target: "node20",
  // Bundle all npm dependencies EXCEPT Prisma (needs native binaries)
  noExternal: [/^(?!@prisma).*/],
  external: [
    "@prisma/client",
    ".prisma/client",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
});
