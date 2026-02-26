import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHarden, applyHardenFix } from "../harden.js";

function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "harden-test-"));
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(dir, path);
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(fullPath, content);
  }
  return dir;
}

describe("Harden engine", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch {}
    }
    dirs.length = 0;
  });

  // ── Helmet ──────────────────────────────────────────────────────────

  describe("helmet check", () => {
    it("flags Express app without helmet", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.listen(3000);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-helmet");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("does not flag when helmet is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", helmet: "^7.0.0" } }),
        "src/app.ts": `import express from "express";\nimport helmet from "helmet";\nconst app = express();\napp.use(helmet());\napp.listen(3000);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-helmet");
      expect(suggestion).toBeUndefined();
    });

    it("skips check for non-Express projects", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
        "src/page.tsx": `export default function Home() { return <div>Hello</div>; }`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-helmet");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── Rate limiting ───────────────────────────────────────────────────

  describe("rate limit check", () => {
    it("flags Express app without rate limiting", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/routes/auth.ts": `router.post("/login", (req, res) => { res.send("ok"); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-rate-limit");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("does not flag when express-rate-limit is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", "express-rate-limit": "^7.0.0" } }),
        "src/routes/auth.ts": `import rateLimit from "express-rate-limit";\nconst limiter = rateLimit({ windowMs: 900000, max: 10 });\nrouter.use(limiter);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-rate-limit");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── CSRF ────────────────────────────────────────────────────────────

  describe("CSRF check", () => {
    it("flags Express app with POST routes but no CSRF", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.post("/submit", (req, res) => {});`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csrf");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("medium");
    });

    it("does not flag when csrf-csrf is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", "csrf-csrf": "^3.0.0" } }),
        "src/app.ts": `import { doubleCsrf } from "csrf-csrf";\nconst { doubleCsrfProtection } = doubleCsrf({});\napp.use(doubleCsrfProtection);\napp.post("/submit", handler);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csrf");
      expect(suggestion).toBeUndefined();
    });

    it("skips CSRF check when no POST/PUT routes exist", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.get("/", (req, res) => {});`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csrf");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── CSP ─────────────────────────────────────────────────────────────

  describe("CSP check", () => {
    it("flags Express app without CSP headers", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.listen(3000);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csp");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("flags Next.js app without CSP headers", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
        "next.config.ts": `export default { reactStrictMode: true };`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csp");
      expect(suggestion).toBeDefined();
    });

    it("does not flag when CSP is set via helmet", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", helmet: "^7.0.0" } }),
        "src/app.ts": `import helmet from "helmet";\napp.use(helmet());`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csp");
      expect(suggestion).toBeUndefined();
    });

    it("does not flag when CSP is set manually", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `app.use((req, res, next) => { res.setHeader("Content-Security-Policy", "default-src 'self'"); next(); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-missing-csp");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── CORS ──────────────────────────────────────────────────────────

  describe("CORS check", () => {
    it("flags wildcard cors()", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import cors from "cors";\napp.use(cors());`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-cors-wildcard");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("flags origin: '*'", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `app.use(cors({ origin: "*" }));`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-cors-wildcard");
      expect(suggestion).toBeDefined();
    });

    it("flags origin: true", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `app.use(cors({ origin: true }));`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-cors-wildcard");
      expect(suggestion).toBeDefined();
    });

    it("does not flag when cors has specific origin", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `app.use(cors({ origin: "https://mysite.com" }));`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-cors-wildcard");
      expect(suggestion).toBeUndefined();
    });

    it("skips for non-web frameworks", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
        "src/util.ts": `import _ from "lodash";`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-cors-wildcard");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── Environment leakage ──────────────────────────────────────────

  describe("env leakage check", () => {
    it("flags .env file without .gitignore", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        ".env": "SECRET=abc123",
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-env-no-gitignore");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("flags .env not in .gitignore", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        ".env": "SECRET=abc123",
        ".gitignore": "node_modules\ndist\n",
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-env-not-gitignored");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("does not flag when .env is gitignored", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        ".env": "SECRET=abc123",
        ".gitignore": "node_modules\n.env\n",
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const envSuggestions = result.suggestions.filter((s) => s.id.startsWith("harden-env"));
      expect(envSuggestions).toHaveLength(0);
    });

    it("skips when no .env files exist", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        ".gitignore": "node_modules\n",
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const envSuggestions = result.suggestions.filter((s) => s.id.startsWith("harden-env"));
      expect(envSuggestions).toHaveLength(0);
    });
  });

  // ── Error exposure ────────────────────────────────────────────────

  describe("error exposure check", () => {
    it("flags Express app without error handler", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.get("/", handler);\napp.listen(3000);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-error-exposure");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("medium");
    });

    it("does not flag when custom error handler exists", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.use((err, req, res, next) => { res.status(500).json({ error: "oops" }); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-error-exposure");
      expect(suggestion).toBeUndefined();
    });

    it("does not flag when Sentry is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import * as Sentry from "@sentry/node";\nSentry.init({});\nconst app = express();`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-error-exposure");
      expect(suggestion).toBeUndefined();
    });

    it("skips for non-Express projects", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
        "src/page.tsx": `export default function Home() { return <div/>; }`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-error-exposure");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── Input validation ──────────────────────────────────────────────

  describe("input validation check", () => {
    it("flags routes using req.body without validation", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/routes/users.ts": `router.post("/users", (req, res) => { db.create(req.body); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-no-input-validation");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("does not flag when zod is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", zod: "^3.0.0" } }),
        "src/routes/users.ts": `import { z } from "zod";\nconst schema = z.object({ name: z.string() });\nrouter.post("/users", (req, res) => { schema.parse(req.body); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-no-input-validation");
      expect(suggestion).toBeUndefined();
    });

    it("does not flag when joi is used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", joi: "^17.0.0" } }),
        "src/routes/users.ts": `const schema = Joi.object({ name: Joi.string() });\nrouter.post("/users", (req, res) => { schema.validate(req.body); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-no-input-validation");
      expect(suggestion).toBeUndefined();
    });

    it("skips when no routes accept input", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `app.get("/health", (req, res) => { res.json({ ok: true }); });`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-no-input-validation");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── Secure cookies ────────────────────────────────────────────────

  describe("secure cookies check", () => {
    it("flags cookies without security flags", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", "express-session": "^1.0.0" } }),
        "src/app.ts": `import session from "express-session";\napp.use(session({ secret: "abc" }));`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-insecure-cookies");
      expect(suggestion).toBeDefined();
      expect(suggestion!.severity).toBe("high");
    });

    it("does not flag when secure flags are set", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", "express-session": "^1.0.0" } }),
        "src/app.ts": `import session from "express-session";\napp.use(session({ secret: "abc", cookie: { httpOnly: true, secure: true, sameSite: "strict" } }));`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-insecure-cookies");
      expect(suggestion).toBeUndefined();
    });

    it("skips when no cookies/sessions are used", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
        "src/app.ts": `import express from "express";\nconst app = express();\napp.listen(3000);`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-insecure-cookies");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── TypeScript strict ───────────────────────────────────────────────

  describe("TypeScript strict check", () => {
    it("flags tsconfig without strict mode", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022" } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-ts-no-strict");
      expect(suggestion).toBeDefined();
      expect(suggestion!.autoFixable).toBe(true);
      expect(suggestion!.severity).toBe("medium");
    });

    it("does not flag when strict is true", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-ts-no-strict");
      expect(suggestion).toBeUndefined();
    });

    it("skips when no tsconfig.json exists", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-ts-no-strict");
      expect(suggestion).toBeUndefined();
    });
  });

  // ── --apply ─────────────────────────────────────────────────────────

  describe("applyHardenFix", () => {
    it("applies tsconfig strict mode fix", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022" } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      const suggestion = result.suggestions.find((s) => s.id === "harden-ts-no-strict")!;

      const applied = applyHardenFix(dir, suggestion);
      expect(applied).toBe(true);

      // Verify the fix was applied
      const afterResult = runHarden(dir);
      const afterSuggestion = afterResult.suggestions.find((s) => s.id === "harden-ts-no-strict");
      expect(afterSuggestion).toBeUndefined();
    });

    it("returns false for non-auto-fixable suggestions", () => {
      const suggestion: import("../harden.js").HardenSuggestion = {
        id: "harden-missing-helmet",
        title: "test",
        description: "test",
        filePath: "test",
        suggestedCode: "test",
        autoFixable: false,
        severity: "high",
      };

      const applied = applyHardenFix("/tmp", suggestion);
      expect(applied).toBe(false);
    });
  });

  // ── Framework detection ─────────────────────────────────────────────

  describe("framework detection", () => {
    it("detects Express + TypeScript", () => {
      const dir = makeProject({
        "package.json": JSON.stringify({
          dependencies: { express: "^4.0.0" },
          devDependencies: { typescript: "^5.0.0" },
        }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      });
      dirs.push(dir);

      const result = runHarden(dir);
      expect(result.frameworksDetected).toContain("express");
      expect(result.frameworksDetected).toContain("typescript");
    });

    it("returns empty for project without package.json", () => {
      const dir = makeProject({
        "src/app.ts": `console.log("no package.json");`,
      });
      dirs.push(dir);

      const result = runHarden(dir);
      expect(result.suggestions).toHaveLength(0);
      expect(result.frameworksDetected).toHaveLength(0);
    });
  });
});
