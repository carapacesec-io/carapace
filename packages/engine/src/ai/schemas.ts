import { z } from "zod";

export const SeveritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export type Severity = z.infer<typeof SeveritySchema>;

export const FindingSchema = z.object({
  severity: SeveritySchema,
  category: z.string(),
  title: z.string(),
  description: z.string(),
  filePath: z.string(),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  codeSnippet: z.string(),
  suggestion: z.string(),
  fixDiff: z.string(),
  ruleId: z.string(),
  cweIds: z.array(z.string()).optional(),
  owaspCategory: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const SecurityScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  breakdown: z.record(
    SeveritySchema,
    z.object({ count: z.number(), deducted: z.number() }),
  ),
});

export type SecurityScoreOutput = z.infer<typeof SecurityScoreSchema>;

export const ReviewResultSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string(),
  score: SecurityScoreSchema.optional(),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;
