"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FixPR {
  id: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  filesFixed: number;
  findingsFixed: number;
  status: string;
  createdAt: string;
}

interface AutoFixSettings {
  autoFix: boolean;
  autoFixPR: boolean;
  autoFixCategories: string[];
  fixPRs: FixPR[];
}

const CATEGORIES = [
  "security",
  "gas-optimization",
  "code-quality",
  "best-practices",
  "performance",
  "crypto",
];

export default function AutoFixControl({ repoId }: { repoId: string }) {
  const [settings, setSettings] = useState<AutoFixSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setSavedMsg(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSavedMsg(false), 2000);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/repos/${repoId}/auto-fix`);
        if (!res.ok) throw new Error();
        const data: AutoFixSettings = await res.json();
        setSettings(data);
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [repoId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const save = async (patch: Partial<AutoFixSettings>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/repos/${repoId}/auto-fix`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSettings((prev) => (prev ? { ...prev, ...data } : prev));
      flash();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const toggleAutoFix = () => {
    if (!settings) return;
    save({ autoFix: !settings.autoFix });
    setSettings({ ...settings, autoFix: !settings.autoFix });
  };

  const toggleAutoFixPR = () => {
    if (!settings) return;
    save({ autoFixPR: !settings.autoFixPR });
    setSettings({ ...settings, autoFixPR: !settings.autoFixPR });
  };

  const toggleCategory = (cat: string) => {
    if (!settings) return;
    const current = settings.autoFixCategories;
    const next = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    save({ autoFixCategories: next });
    setSettings({ ...settings, autoFixCategories: next });
  };

  if (loading) {
    return (
      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="py-6">
          <div className="h-6 animate-pulse bg-zinc-800 rounded w-48" />
        </CardContent>
      </Card>
    );
  }

  const statusColor = (status: string) => {
    if (status === "MERGED") return "bg-purple-600";
    if (status === "CLOSED") return "bg-zinc-600";
    return "bg-emerald-600";
  };

  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-zinc-100">Auto-Fix</CardTitle>
            <CardDescription className="text-zinc-400">
              Automatically fix issues and open pull requests
            </CardDescription>
          </div>
          <span
            className={`text-xs font-medium text-emerald-400 transition-opacity duration-300 ${
              savedMsg ? "opacity-100" : "opacity-0"
            }`}
          >
            Saved
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto-fix on PRs toggle */}
        <Toggle
          label="Auto-fix on PRs"
          description={
            settings?.autoFix
              ? "Fixes are committed to PR branches automatically"
              : "Fixes are only suggested, not applied"
          }
          enabled={settings?.autoFix ?? false}
          disabled={saving}
          onToggle={toggleAutoFix}
        />

        {/* Auto-fix PR creation toggle */}
        <Toggle
          label="Open fix PRs for scheduled scans"
          description={
            settings?.autoFixPR
              ? "A PR with fixes is opened after each scheduled scan"
              : "Scheduled scan fixes are reported but not applied"
          }
          enabled={settings?.autoFixPR ?? false}
          disabled={saving}
          onToggle={toggleAutoFixPR}
        />

        {/* Category filter */}
        {(settings?.autoFix || settings?.autoFixPR) && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-300">
              Limit auto-fix to categories
            </p>
            <p className="text-xs text-zinc-500">
              Leave all unselected to fix all categories
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const selected = settings?.autoFixCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    disabled={saving}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 border ${
                      selected
                        ? "bg-emerald-600 text-white border-transparent ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-950"
                        : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent fix PRs */}
        {settings?.fixPRs && settings.fixPRs.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium text-zinc-300">Recent Fix PRs</p>
            <div className="space-y-2">
              {settings.fixPRs.map((pr) => (
                <a
                  key={pr.id}
                  href={pr.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Badge className={`${statusColor(pr.status)} text-white text-[10px]`}>
                      {pr.status}
                    </Badge>
                    <span className="text-sm text-zinc-100">
                      PR #{pr.prNumber}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {pr.findingsFixed} fixes, {pr.filesFixed} files
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(pr.createdAt).toLocaleDateString()}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Toggle({
  label,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors select-none ${
        disabled ? "opacity-50" : "cursor-pointer hover:border-zinc-700"
      }`}
    >
      <div>
        <p className="font-medium text-sm text-zinc-100">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <div
        className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0 ${
          enabled ? "bg-emerald-600" : "bg-zinc-700"
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-200 ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </div>
    </div>
  );
}
