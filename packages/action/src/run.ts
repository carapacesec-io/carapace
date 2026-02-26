import * as core from "@actions/core";
import * as github from "@actions/github";
import { analyze, formatAsReviewComments } from "@carapace/engine";
import type { Finding } from "@carapace/engine";

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"] as const;

async function run() {
  try {
    const mode = core.getInput("mode");
    const severityThreshold = core.getInput("severity-threshold");
    const rulesets = core.getInput("rulesets").split(",").map((s) => s.trim());
    const targetChains = core
      .getInput("target-chains")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const failOn = core.getInput("fail-on");
    const staticOnlyInput = core.getInput("static-only") === "true";

    const context = github.context;

    if (context.eventName !== "pull_request") {
      core.warning("Carapace only runs on pull_request events");
      return;
    }

    const prNumber = context.payload.pull_request?.number;
    if (!prNumber) {
      core.setFailed("Could not determine PR number");
      return;
    }

    const token = core.getInput("GITHUB_TOKEN") || process.env.GITHUB_TOKEN;
    if (!token) {
      core.setFailed("GITHUB_TOKEN is required. Add `permissions: { contents: read, pull-requests: write }` to your workflow.");
      return;
    }
    const octokit = github.getOctokit(token);

    // Fetch PR diff
    const { data: diff } = await octokit.rest.pulls.get({
      ...context.repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });

    const diffText = diff as unknown as string;

    let result;

    if (mode === "cloud") {
      // Call Carapace API
      const apiKey = core.getInput("api-key");
      if (!apiKey) {
        core.setFailed("api-key is required for cloud mode");
        return;
      }

      const response = await fetch("https://api.carapacesec.io/v1/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          diff: diffText,
          rulesets,
          targetChains,
        }),
      });

      if (!response.ok) {
        core.setFailed(`Carapace API returned ${response.status}`);
        return;
      }

      result = await response.json();
    } else {
      // Local mode — use engine directly
      const anthropicKey = core.getInput("anthropic-api-key");
      const staticOnly = staticOnlyInput || !anthropicKey;

      if (!anthropicKey) {
        core.info("No anthropic-api-key provided — running static analysis only");
      }

      result = await analyze({
        diff: diffText,
        enabledRulesets: rulesets,
        targetChains: targetChains.length > 0 ? targetChains : undefined,
        apiKey: anthropicKey || undefined,
        staticOnly,
      });
    }

    // Filter by severity threshold
    const thresholdIndex = SEVERITY_ORDER.indexOf(
      severityThreshold as (typeof SEVERITY_ORDER)[number]
    );
    const filteredFindings = result.findings.filter(
      (f: Finding) =>
        SEVERITY_ORDER.indexOf(
          f.severity as (typeof SEVERITY_ORDER)[number]
        ) >= thresholdIndex
    );

    // Post review comments
    const prFiles = await octokit.rest.pulls.listFiles({
      ...context.repo,
      pull_number: prNumber,
    });

    const fileNames = prFiles.data.map((f) => f.filename);
    const reviewComments = formatAsReviewComments(filteredFindings, fileNames);

    const hasCritical = filteredFindings.some(
      (f: Finding) => f.severity === "critical" || f.severity === "high"
    );

    if (reviewComments.length > 0) {
      await octokit.rest.pulls.createReview({
        ...context.repo,
        pull_number: prNumber,
        commit_id: context.payload.pull_request!.head.sha,
        event: hasCritical ? "REQUEST_CHANGES" : "COMMENT",
        body: `## Carapace Review\n\n${result.summary}\n\n---\nFound **${filteredFindings.length}** issue(s)`,
        comments: reviewComments.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
        })),
      });
    } else {
      await octokit.rest.pulls.createReview({
        ...context.repo,
        pull_number: prNumber,
        commit_id: context.payload.pull_request!.head.sha,
        event: "APPROVE",
        body: "## Carapace Review\n\nNo issues found. Code looks good!",
      });
    }

    // Set outputs
    core.setOutput("findings-count", filteredFindings.length.toString());
    core.setOutput(
      "critical-count",
      filteredFindings
        .filter((f: Finding) => f.severity === "critical")
        .length.toString()
    );
    core.setOutput("summary", result.summary);

    // Fail check if needed
    if (failOn !== "none") {
      const failIndex = SEVERITY_ORDER.indexOf(
        failOn as (typeof SEVERITY_ORDER)[number]
      );
      const shouldFail = filteredFindings.some(
        (f: Finding) =>
          SEVERITY_ORDER.indexOf(
            f.severity as (typeof SEVERITY_ORDER)[number]
          ) >= failIndex
      );
      if (shouldFail) {
        core.setFailed(
          `Carapace found ${filteredFindings.length} issue(s) at or above '${failOn}' severity`
        );
      }
    }
  } catch (error) {
    core.setFailed(
      error instanceof Error ? error.message : "Unknown error occurred"
    );
  }
}

run();
