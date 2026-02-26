"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "loading" | "success" | "error";

interface DiffLine {
  type: "removed" | "added" | "context" | "header";
  content: string;
}

function parseDiffLines(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  const result: DiffLine[] = [];

  for (const line of lines) {
    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("@@")
    ) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("-")) {
      result.push({ type: "removed", content: line.slice(1) });
    } else if (line.startsWith("+")) {
      result.push({ type: "added", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      result.push({ type: "context", content: line.slice(1) });
    } else if (line.length > 0) {
      result.push({ type: "context", content: line });
    }
  }

  return result;
}

export function FixButton({
  scanId,
  findingId,
  fixDiff,
}: {
  scanId: string;
  findingId: string;
  fixDiff: string;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const diffLines = parseDiffLines(fixDiff);

  async function handleApply() {
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch(`/api/scans/${scanId}/fix-finding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      setStatus("success");
      setMessage(data.message ?? "Fix applied");
      setShowPreview(false);
    } catch (err: unknown) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Something went wrong."
      );
    }
  }

  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Fixed
      </span>
    );
  }

  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowPreview(!showPreview)}
        className="text-xs"
      >
        {showPreview ? "Hide diff" : "Fix"}
      </Button>

      {showPreview && (
        <div className="mt-3 rounded-lg border border-zinc-800 overflow-hidden">
          {/* Diff header */}
          <div className="flex items-center justify-between bg-zinc-900/70 px-4 py-2 text-xs text-muted-foreground border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500/80" />
                Before
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                After
              </span>
            </div>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={status === "loading"}
              className="text-xs h-7"
            >
              {status === "loading" ? "Applying..." : "Apply Fix"}
            </Button>
          </div>

          {/* Diff body */}
          <pre className="bg-zinc-900 text-sm overflow-x-auto max-h-[300px] overflow-y-auto">
            <code>
              {diffLines.map((line, i) => {
                if (line.type === "header") {
                  return (
                    <div
                      key={i}
                      className="bg-zinc-800/50 text-zinc-500 px-4 py-0.5 select-none"
                    >
                      {line.content}
                    </div>
                  );
                }
                if (line.type === "removed") {
                  return (
                    <div
                      key={i}
                      className="bg-red-500/10 text-red-400 px-4 py-0.5"
                    >
                      <span className="inline-block w-6 text-right mr-2 text-red-400/50 select-none">
                        -
                      </span>
                      {line.content}
                    </div>
                  );
                }
                if (line.type === "added") {
                  return (
                    <div
                      key={i}
                      className="bg-emerald-500/10 text-emerald-400 px-4 py-0.5"
                    >
                      <span className="inline-block w-6 text-right mr-2 text-emerald-400/50 select-none">
                        +
                      </span>
                      {line.content}
                    </div>
                  );
                }
                return (
                  <div key={i} className="text-zinc-400 px-4 py-0.5">
                    <span className="inline-block w-6 text-right mr-2 text-zinc-600 select-none">
                      &nbsp;
                    </span>
                    {line.content}
                  </div>
                );
              })}
            </code>
          </pre>

          {message && (
            <div
              className={`px-4 py-2 text-xs border-t border-zinc-800 ${
                status === "error" ? "text-red-400" : "text-muted-foreground"
              }`}
            >
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
