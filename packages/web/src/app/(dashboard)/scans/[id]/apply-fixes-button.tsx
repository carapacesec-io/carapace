"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "loading" | "success" | "error";

export function ApplyFixesButton({ scanId }: { scanId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch(`/api/scans/${scanId}/fix`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      setStatus("success");
      setMessage(data.message ?? "Fixes applied successfully.");
    } catch (err: unknown) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Something went wrong."
      );
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        onClick={handleClick}
        disabled={status === "loading" || status === "success"}
        size="sm"
      >
        {status === "loading" && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {status === "idle" && "Apply All Fixes"}
        {status === "loading" && "Applying..."}
        {status === "success" && "Fixes Applied"}
        {status === "error" && "Retry Fixes"}
      </Button>

      {message && (
        <p
          className={`text-xs ${
            status === "success"
              ? "text-emerald-400"
              : status === "error"
                ? "text-red-400"
                : "text-muted-foreground"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
