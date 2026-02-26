// ---------------------------------------------------------------------------
// Harden engine — detect missing security controls in a project
//
// Project-scoped checks: reads package.json to detect frameworks, then scans
// source files for the presence (or absence) of security hardening patterns.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ── Types ───────────────────────────────────────────────────────────────────

export interface HardenSuggestion {
  id: string;
  title: string;
  description: string;
  /** File where the control should be added (or "project" for project-wide) */
  filePath: string;
  /** What the user should add */
  suggestedCode: string;
  /** Can --apply auto-fix this? */
  autoFixable: boolean;
  severity: "high" | "medium" | "low";
}

export interface HardenResult {
  suggestions: HardenSuggestion[];
  projectPath: string;
  frameworksDetected: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function walkFiles(dir: string, exts: string[], maxDepth = 6, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === ".next") continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...walkFiles(full, exts, maxDepth, depth + 1));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function fileContains(filePath: string, pattern: RegExp): boolean {
  try {
    const content = readFileSync(filePath, "utf-8");
    return pattern.test(content);
  } catch {
    return false;
  }
}

function anyFileContains(files: string[], pattern: RegExp): string | null {
  for (const f of files) {
    if (fileContains(f, pattern)) return f;
  }
  return null;
}

function detectFrameworks(pkgJson: Record<string, unknown>): string[] {
  const deps = {
    ...(pkgJson.dependencies as Record<string, string> ?? {}),
    ...(pkgJson.devDependencies as Record<string, string> ?? {}),
  };
  const frameworks: string[] = [];
  if (deps["express"]) frameworks.push("express");
  if (deps["next"]) frameworks.push("next");
  if (deps["koa"]) frameworks.push("koa");
  if (deps["fastify"]) frameworks.push("fastify");
  if (deps["hapi"] || deps["@hapi/hapi"]) frameworks.push("hapi");
  if (deps["typescript"]) frameworks.push("typescript");
  return frameworks;
}

// ── Checks ──────────────────────────────────────────────────────────────────

function checkHelmet(
  projectPath: string,
  sourceFiles: string[],
  frameworks: string[],
): HardenSuggestion | null {
  if (!frameworks.includes("express")) return null;

  // Check if helmet is already used anywhere
  const helmetFile = anyFileContains(sourceFiles, /\bhelmet\s*\(/);
  if (helmetFile) return null;

  // Check if helmet is in dependencies
  const pkgJson = readJson(join(projectPath, "package.json"));
  const deps = {
    ...(pkgJson?.dependencies as Record<string, string> ?? {}),
    ...(pkgJson?.devDependencies as Record<string, string> ?? {}),
  };
  const hasHelmetDep = !!deps["helmet"];

  // Find the main Express app file (look for express() or app.listen)
  const appFile = anyFileContains(sourceFiles, /express\s*\(\s*\)/) ??
    anyFileContains(sourceFiles, /app\.listen\s*\(/) ??
    "app.ts";

  return {
    id: "harden-missing-helmet",
    title: "Express app without helmet() middleware",
    description:
      "helmet() sets security-related HTTP headers (X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options, etc.). Without it, your app is missing baseline HTTP hardening.",
    filePath: relative(projectPath, appFile) || appFile,
    suggestedCode: hasHelmetDep
      ? `import helmet from "helmet";\n\n// Add before other middleware:\napp.use(helmet());`
      : `// 1. Install: npm install helmet\n// 2. Add to your Express app:\nimport helmet from "helmet";\napp.use(helmet());`,
    autoFixable: false,
    severity: "high",
  };
}

function checkRateLimit(
  projectPath: string,
  sourceFiles: string[],
  frameworks: string[],
): HardenSuggestion | null {
  if (!frameworks.includes("express") && !frameworks.includes("next")) return null;

  // Check if any rate limiting library is in use
  const rateLimitPatterns = /\b(rateLimit|rateLimiter|express-rate-limit|rate-limiter-flexible|express-slow-down|limiter)\b/;
  const rateLimitFile = anyFileContains(sourceFiles, rateLimitPatterns);
  if (rateLimitFile) return null;

  // Find auth-related route files
  const authFile = anyFileContains(sourceFiles, /\/(auth|login|signin|register|signup)\b/) ??
    anyFileContains(sourceFiles, /\bpassword\b.*\broute\b|\broute\b.*\bpassword\b/i) ??
    "routes/auth.ts";

  return {
    id: "harden-missing-rate-limit",
    title: "No rate limiting on authentication routes",
    description:
      "Authentication endpoints (login, register, password reset) without rate limiting are vulnerable to brute-force and credential-stuffing attacks.",
    filePath: relative(projectPath, authFile) || authFile,
    suggestedCode: `// 1. Install: npm install express-rate-limit
// 2. Add to auth routes:
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many attempts, please try again later",
});

// Apply to auth routes:
app.use("/auth", authLimiter);
app.use("/login", authLimiter);`,
    autoFixable: false,
    severity: "high",
  };
}

function checkCsrf(
  projectPath: string,
  sourceFiles: string[],
  frameworks: string[],
): HardenSuggestion | null {
  if (!frameworks.includes("express")) return null;

  // Check if any CSRF library is in use
  const csrfPatterns = /\b(csrf|csurf|csrf-csrf|lusca|csrfToken|_csrf)\b/;
  const csrfFile = anyFileContains(sourceFiles, csrfPatterns);
  if (csrfFile) return null;

  // Check if the app has forms or POST routes (otherwise CSRF is less relevant)
  const hasFormRoutes = anyFileContains(sourceFiles, /\.(post|put|patch|delete)\s*\(/);
  if (!hasFormRoutes) return null;

  const appFile = anyFileContains(sourceFiles, /express\s*\(\s*\)/) ?? "app.ts";

  return {
    id: "harden-missing-csrf",
    title: "Express app without CSRF protection",
    description:
      "Forms and state-changing endpoints without CSRF protection allow attackers to forge requests on behalf of authenticated users via malicious sites.",
    filePath: relative(projectPath, appFile) || appFile,
    suggestedCode: `// 1. Install: npm install csrf-csrf
// 2. Add CSRF middleware:
import { doubleCsrf } from "csrf-csrf";

const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  cookieName: "__csrf",
  cookieOptions: { httpOnly: true, sameSite: "strict", secure: true },
});

app.use(doubleCsrfProtection);`,
    autoFixable: false,
    severity: "medium",
  };
}

function checkCsp(
  projectPath: string,
  sourceFiles: string[],
  frameworks: string[],
): HardenSuggestion | null {
  if (!frameworks.includes("express") && !frameworks.includes("next")) return null;

  // Check if CSP is set via helmet, meta tag, or manual header
  const cspPatterns = /Content-Security-Policy|contentSecurityPolicy|\.csp\s*\(|helmet\s*\(/;
  const cspFile = anyFileContains(sourceFiles, cspPatterns);
  if (cspFile) return null;

  // For Next.js, check next.config headers
  const nextConfig = anyFileContains(sourceFiles, /Content-Security-Policy/);
  if (nextConfig) return null;

  const appFile = anyFileContains(sourceFiles, /express\s*\(\s*\)/) ??
    anyFileContains(sourceFiles, /next\.config/) ??
    "app.ts";

  const isNext = frameworks.includes("next");

  return {
    id: "harden-missing-csp",
    title: "No Content-Security-Policy headers",
    description:
      "Content-Security-Policy (CSP) prevents XSS, clickjacking, and other code injection attacks by controlling which resources the browser is allowed to load.",
    filePath: relative(projectPath, appFile) || appFile,
    suggestedCode: isNext
      ? `// Add to next.config.ts:
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';",
  },
];

// In your config:
async headers() {
  return [{ source: "/(.*)", headers: securityHeaders }];
}`
      : `// Add CSP header middleware:
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';"
  );
  next();
});`,
    autoFixable: false,
    severity: "high",
  };
}

function checkCors(
  projectPath: string,
  sourceFiles: string[],
  frameworks: string[],
): HardenSuggestion | null {
  if (!frameworks.includes("express") && !frameworks.includes("fastify") && !frameworks.includes("next")) return null;

  // Check if cors is used with wildcard or no origin restriction
  const wildcardCors = anyFileContains(sourceFiles, /cors\s*\(\s*\)/) ??
    anyFileContains(sourceFiles, /origin\s*:\s*["'`]\*["'`]/) ??
    anyFileContains(sourceFiles, /origin\s*:\s*true\b/);

  if (wildcardCors) {
    return {
      id: "harden-cors-wildcard",
      title: "CORS allows all origins",
      description:
        "CORS configured with wildcard (*) or origin: true allows any website to make cross-origin requests to your API. This can enable data theft if endpoints return sensitive data.",
      filePath: relative(projectPath, wildcardCors) || wildcardCors,
      suggestedCode: `// Restrict CORS to your actual frontend origins:
import cors from "cors";

app.use(cors({
  origin: ["https://yourdomain.com"],
  credentials: true,
}));`,
      autoFixable: false,
      severity: "high",
    };
  }

  return null;
}

function checkEnvLeakage(
  projectPath: string,
): HardenSuggestion | null {
  const gitignorePath = join(projectPath, ".gitignore");
  if (!existsSync(gitignorePath)) {
    // No .gitignore at all — flag it
    const hasEnvFile = existsSync(join(projectPath, ".env")) ||
      existsSync(join(projectPath, ".env.local"));
    if (!hasEnvFile) return null; // No .env files, not relevant

    return {
      id: "harden-env-no-gitignore",
      title: ".env file exists without .gitignore",
      description:
        "Environment files (.env) contain secrets like API keys and database URLs. Without a .gitignore entry, these can be committed to version control and leaked publicly.",
      filePath: ".gitignore",
      suggestedCode: `# Add a .gitignore with at minimum:
.env
.env.*
!.env.example`,
      autoFixable: false,
      severity: "high",
    };
  }

  // .gitignore exists — check if .env is covered
  try {
    const gitignore = readFileSync(gitignorePath, "utf-8");
    const hasEnvRule = /^\.env$/m.test(gitignore) ||
      /^\.env\.\*$/m.test(gitignore) ||
      /^\.env\*$/m.test(gitignore) ||
      /^\.env\.local$/m.test(gitignore);
    if (hasEnvRule) return null;

    // Only flag if .env files actually exist
    const hasEnvFile = existsSync(join(projectPath, ".env")) ||
      existsSync(join(projectPath, ".env.local")) ||
      existsSync(join(projectPath, ".env.production"));
    if (!hasEnvFile) return null;

    return {
      id: "harden-env-not-gitignored",
      title: ".env files not in .gitignore",
      description:
        "Your project has .env files but .gitignore does not exclude them. Secrets in .env files can be accidentally committed and pushed to public repositories.",
      filePath: ".gitignore",
      suggestedCode: `# Add these lines to .gitignore:
.env
.env.*
!.env.example`,
      autoFixable: false,
      severity: "high",
    };
  } catch {
    return null;
  }
}

function checkErrorExposure(
  projectPath: string,
  sourceFiles: string[],
  frameworks: string[],
): HardenSuggestion | null {
  if (!frameworks.includes("express")) return null;

  // Check if there's a custom error handler (4-arg middleware)
  const errorHandlerPattern = /\(\s*(?:err|error)\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/;
  const hasErrorHandler = anyFileContains(sourceFiles, errorHandlerPattern);
  if (hasErrorHandler) return null;

  // Also check for error-handling packages
  const errorPkgPattern = /express-async-errors|@sentry\/node|express-error-handler/;
  const hasErrorPkg = anyFileContains(sourceFiles, errorPkgPattern);
  if (hasErrorPkg) return null;

  const appFile = anyFileContains(sourceFiles, /express\s*\(\s*\)/) ??
    anyFileContains(sourceFiles, /app\.listen\s*\(/) ??
    "app.ts";

  return {
    id: "harden-error-exposure",
    title: "Express app without custom error handler",
    description:
      "Without a custom error handler, Express sends the full stack trace to clients in development and a generic HTML page in production. A proper error handler prevents information leakage and gives you control over error responses.",
    filePath: relative(projectPath, appFile) || appFile,
    suggestedCode: `// Add as the LAST middleware (after all routes):
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: "Internal server error" });
});`,
    autoFixable: false,
    severity: "medium",
  };
}

function checkInputValidation(
  projectPath: string,
  sourceFiles: string[],
  frameworks: string[],
): HardenSuggestion | null {
  if (!frameworks.includes("express") && !frameworks.includes("next") && !frameworks.includes("fastify")) return null;

  // Check if any validation library is in use
  const validationPatterns = /\b(zod|z\.object|z\.string|joi|Joi\.object|yup|yup\.object|class-validator|IsString|IsEmail|ajv|validateRequest|celebrate)\b/;
  const validationFile = anyFileContains(sourceFiles, validationPatterns);
  if (validationFile) return null;

  // Only flag if there are route handlers that accept input
  const hasInputRoutes = anyFileContains(sourceFiles, /req\.body|request\.json\(\)|request\.body/);
  if (!hasInputRoutes) return null;

  const routeFile = anyFileContains(sourceFiles, /req\.body/) ??
    anyFileContains(sourceFiles, /request\.json\(\)/) ??
    "routes/index.ts";

  return {
    id: "harden-no-input-validation",
    title: "API routes accept input without validation",
    description:
      "Request bodies are used directly without schema validation. Unvalidated input is the root cause of injection attacks (SQL, NoSQL, command), type confusion bugs, and unexpected crashes.",
    filePath: relative(projectPath, routeFile) || routeFile,
    suggestedCode: `// 1. Install: npm install zod
// 2. Validate request bodies:
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

app.post("/users", (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten() });
  }
  // result.data is now typed and validated
});`,
    autoFixable: false,
    severity: "high",
  };
}

function checkSecureCookies(
  projectPath: string,
  sourceFiles: string[],
  frameworks: string[],
): HardenSuggestion | null {
  if (!frameworks.includes("express") && !frameworks.includes("next")) return null;

  // Check if cookies/sessions are used
  const cookiePatterns = /\b(express-session|cookie-session|cookie-parser|res\.cookie\s*\(|setCookie|set-cookie)\b/;
  const cookieFile = anyFileContains(sourceFiles, cookiePatterns);
  if (!cookieFile) return null;

  // Check if secure flags are set
  const secureFlags = /httpOnly\s*:\s*true|secure\s*:\s*true|sameSite\s*:\s*["'`](strict|lax|none)["'`]/;
  const hasSecureFlags = anyFileContains(sourceFiles, secureFlags);
  if (hasSecureFlags) return null;

  return {
    id: "harden-insecure-cookies",
    title: "Cookies set without security flags",
    description:
      "Cookies (session or custom) are being set without httpOnly, secure, or sameSite flags. This makes them vulnerable to XSS theft (missing httpOnly), man-in-the-middle attacks (missing secure), and CSRF (missing sameSite).",
    filePath: relative(projectPath, cookieFile) || cookieFile,
    suggestedCode: `// Always set security flags on cookies:
app.use(session({
  cookie: {
    httpOnly: true,   // Prevents JavaScript access (XSS protection)
    secure: true,     // Only sent over HTTPS
    sameSite: "lax",  // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Or for individual cookies:
res.cookie("token", value, {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
});`,
    autoFixable: false,
    severity: "high",
  };
}

function checkTsStrict(
  projectPath: string,
): HardenSuggestion | null {
  const tsconfigPath = join(projectPath, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return null;

  const tsconfig = readJson(tsconfigPath);
  if (!tsconfig) return null;

  const compilerOptions = tsconfig.compilerOptions as Record<string, unknown> | undefined;
  if (compilerOptions?.strict === true) return null;

  return {
    id: "harden-ts-no-strict",
    title: "TypeScript strict mode not enabled",
    description:
      "TypeScript strict mode enables strictNullChecks, noImplicitAny, strictBindCallApply, and other checks that catch type-safety bugs before they become runtime vulnerabilities.",
    filePath: "tsconfig.json",
    suggestedCode: `// In tsconfig.json compilerOptions:
"strict": true`,
    autoFixable: true,
    severity: "medium",
  };
}

// ── Apply ───────────────────────────────────────────────────────────────────

export function applyHardenFix(projectPath: string, suggestion: HardenSuggestion): boolean {
  if (!suggestion.autoFixable) return false;

  if (suggestion.id === "harden-ts-no-strict") {
    const tsconfigPath = join(projectPath, "tsconfig.json");
    const tsconfig = readJson(tsconfigPath);
    if (!tsconfig) return false;

    const compilerOptions = (tsconfig.compilerOptions ?? {}) as Record<string, unknown>;
    compilerOptions.strict = true;
    tsconfig.compilerOptions = compilerOptions;

    try {
      writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

// ── Main ────────────────────────────────────────────────────────────────────

export function runHarden(projectPath: string): HardenResult {
  const pkgJsonPath = join(projectPath, "package.json");
  const pkgJson = readJson(pkgJsonPath);

  if (!pkgJson) {
    return { suggestions: [], projectPath, frameworksDetected: [] };
  }

  const frameworks = detectFrameworks(pkgJson);
  const sourceFiles = walkFiles(projectPath, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

  const checks = [
    checkHelmet(projectPath, sourceFiles, frameworks),
    checkRateLimit(projectPath, sourceFiles, frameworks),
    checkCsrf(projectPath, sourceFiles, frameworks),
    checkCsp(projectPath, sourceFiles, frameworks),
    checkCors(projectPath, sourceFiles, frameworks),
    checkEnvLeakage(projectPath),
    checkErrorExposure(projectPath, sourceFiles, frameworks),
    checkInputValidation(projectPath, sourceFiles, frameworks),
    checkSecureCookies(projectPath, sourceFiles, frameworks),
    checkTsStrict(projectPath),
  ];

  return {
    suggestions: checks.filter((s): s is HardenSuggestion => s !== null),
    projectPath,
    frameworksDetected: frameworks,
  };
}
