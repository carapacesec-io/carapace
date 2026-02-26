"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ---------- types ---------- */

interface Settings {
  severityThreshold: string;
  autoReview: boolean;
  ignoredPaths: string[];
  enabledRulesets: string[];
  slackWebhookUrl: string | null;
  discordWebhookUrl: string | null;
  notifyOnScheduled: boolean;
  notifyOnCritical: boolean;
}

const SEVERITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

const RULESETS: { key: string; label: string; description: string }[] = [
  {
    key: "general",
    label: "General",
    description: "Code quality, bugs, performance, security",
  },
  {
    key: "crypto",
    label: "Crypto / Blockchain",
    description: "Solidity, EVM smart contract security",
  },
  {
    key: "attack",
    label: "Attack Scanning",
    description: "Recon, auth audit, injection, API security",
  },
  {
    key: "quality",
    label: "Code Quality",
    description: "Complexity, naming, dead code, best practices",
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-600 hover:bg-red-500",
  HIGH: "bg-orange-600 hover:bg-orange-500",
  MEDIUM: "bg-yellow-600 hover:bg-yellow-500",
  LOW: "bg-blue-600 hover:bg-blue-500",
  INFO: "bg-gray-600 hover:bg-gray-500",
};

/* ---------- component ---------- */

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [ignoredInput, setIgnoredInput] = useState("");
  const [slackInput, setSlackInput] = useState("");
  const [discordInput, setDiscordInput] = useState("");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* flash "Saved" indicator then clear after 2s */
  const flashSaved = useCallback((field: string) => {
    setSavedField(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000);
  }, []);

  /* generic PUT helper - optimistically update local state then persist */
  const saveField = useCallback(
    async (patch: Partial<Settings>, field: string) => {
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("Save failed");
        const updated: Settings = await res.json();
        setSettings(updated);
        flashSaved(field);
      } catch {
        setError("Failed to save settings. Please try again.");
        setTimeout(() => setError(null), 3000);
      }
    },
    [flashSaved],
  );

  /* fetch on mount */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Fetch failed");
        const data: Settings = await res.json();
        setSettings(data);
        setIgnoredInput(data.ignoredPaths?.join(", ") ?? "");
      } catch {
        setError("Failed to load settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* cleanup timer */
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  /* ---------- handlers ---------- */

  const toggleRuleset = (key: string) => {
    if (!settings) return;
    const current = settings.enabledRulesets ?? [];
    const next = current.includes(key)
      ? current.filter((r) => r !== key)
      : [...current, key];
    setSettings({ ...settings, enabledRulesets: next });
    saveField({ enabledRulesets: next }, "rulesets");
  };

  const setSeverity = (level: string) => {
    if (!settings) return;
    setSettings({ ...settings, severityThreshold: level });
    saveField({ severityThreshold: level }, "severity");
  };

  const toggleAutoReview = () => {
    if (!settings) return;
    const next = !settings.autoReview;
    setSettings({ ...settings, autoReview: next });
    saveField({ autoReview: next }, "autoReview");
  };

  const saveIgnoredPaths = () => {
    if (!settings) return;
    const paths = ignoredInput
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    setSettings({ ...settings, ignoredPaths: paths });
    saveField({ ignoredPaths: paths }, "ignoredPaths");
  };

  const saveSlackUrl = () => {
    if (!settings) return;
    const url = slackInput.trim() || null;
    saveField({ slackWebhookUrl: url }, "slack");
  };

  const saveDiscordUrl = () => {
    if (!settings) return;
    const url = discordInput.trim() || null;
    saveField({ discordWebhookUrl: url }, "discord");
  };

  const toggleNotifyScheduled = () => {
    if (!settings) return;
    const next = !settings.notifyOnScheduled;
    setSettings({ ...settings, notifyOnScheduled: next });
    saveField({ notifyOnScheduled: next }, "notifyScheduled");
  };

  const toggleNotifyCritical = () => {
    if (!settings) return;
    const next = !settings.notifyOnCritical;
    setSettings({ ...settings, notifyOnCritical: next });
    saveField({ notifyOnCritical: next }, "notifyCritical");
  };

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Settings</h1>
          <p className="text-zinc-400 mt-1">Loading your preferences...</p>
        </div>
        <div className="grid gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg bg-zinc-900 border border-zinc-800"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Settings</h1>
          <p className="text-red-400 mt-1">
            {error ?? "Unable to load settings."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Settings</h1>
          <p className="text-zinc-400 mt-1">
            Configure your review preferences
          </p>
        </div>
        {error && (
          <Badge
            variant="destructive"
            className="animate-in fade-in text-xs"
          >
            {error}
          </Badge>
        )}
      </div>

      <div className="grid gap-6">
        {/* ---- Section 1: Review Rules ---- */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-zinc-100">Review Rules</CardTitle>
                <CardDescription className="text-zinc-400">
                  Choose which rule sets to enable for your reviews
                </CardDescription>
              </div>
              <SavedIndicator visible={savedField === "rulesets"} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {RULESETS.map((rule) => {
              const enabled =
                settings.enabledRulesets?.includes(rule.key) ?? false;
              return (
                <div
                  key={rule.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleRuleset(rule.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleRuleset(rule.key);
                    }
                  }}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 cursor-pointer transition-colors hover:border-zinc-700 select-none"
                >
                  <div>
                    <p className="font-medium text-sm text-zinc-100">
                      {rule.label}
                    </p>
                    <p className="text-xs text-zinc-500">{rule.description}</p>
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
            })}
          </CardContent>
        </Card>

        {/* ---- Section 2: Severity Threshold ---- */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-zinc-100">
                  Severity Threshold
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Only show findings at or above this severity level
                </CardDescription>
              </div>
              <SavedIndicator visible={savedField === "severity"} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_LEVELS.map((level) => {
                const active = settings.severityThreshold === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSeverity(level)}
                    className={`px-4 py-2 rounded-md text-xs font-semibold transition-all duration-200 border ${
                      active
                        ? `${SEVERITY_COLORS[level]} text-white border-transparent ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-950`
                        : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500 mt-3">
              Findings below{" "}
              <span className="text-zinc-300 font-medium">
                {settings.severityThreshold}
              </span>{" "}
              will be hidden from reports.
            </p>
          </CardContent>
        </Card>

        {/* ---- Section 3: Auto-Review ---- */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-zinc-100">Auto-Review</CardTitle>
                <CardDescription className="text-zinc-400">
                  Automatically review new pull requests when they are opened
                </CardDescription>
              </div>
              <SavedIndicator visible={savedField === "autoReview"} />
            </div>
          </CardHeader>
          <CardContent>
            <div
              role="button"
              tabIndex={0}
              onClick={toggleAutoReview}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleAutoReview();
                }
              }}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 cursor-pointer transition-colors hover:border-zinc-700 select-none"
            >
              <div>
                <p className="font-medium text-sm text-zinc-100">
                  Enable auto-review
                </p>
                <p className="text-xs text-zinc-500">
                  {settings.autoReview
                    ? "CodeCleaner will automatically review every new PR"
                    : "You will need to trigger reviews manually"}
                </p>
              </div>
              <div
                className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0 ${
                  settings.autoReview ? "bg-emerald-600" : "bg-zinc-700"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-200 ${
                    settings.autoReview ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---- Section 4: Ignored Paths ---- */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-zinc-100">Ignored Paths</CardTitle>
                <CardDescription className="text-zinc-400">
                  Files and directories to skip during review (comma-separated)
                </CardDescription>
              </div>
              <SavedIndicator visible={savedField === "ignoredPaths"} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <input
                type="text"
                value={ignoredInput}
                onChange={(e) => setIgnoredInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveIgnoredPaths();
                  }
                }}
                placeholder="node_modules, dist, .next, coverage"
                className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
              />
              <Button
                onClick={saveIgnoredPaths}
                className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
              >
                Save
              </Button>
            </div>
            {settings.ignoredPaths?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {settings.ignoredPaths.map((p) => (
                  <Badge
                    key={p}
                    variant="secondary"
                    className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs"
                  >
                    {p}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- Section 5: Notifications ---- */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-zinc-100">Notifications</CardTitle>
                <CardDescription className="text-zinc-400">
                  Receive Slack or Discord alerts for scheduled scans and
                  critical findings
                </CardDescription>
              </div>
              <SavedIndicator
                visible={
                  savedField === "slack" ||
                  savedField === "discord" ||
                  savedField === "notifyScheduled" ||
                  savedField === "notifyCritical"
                }
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Slack Webhook */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                Slack Webhook URL
              </label>
              <div className="flex gap-3">
                <input
                  type="url"
                  value={slackInput}
                  onChange={(e) => setSlackInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveSlackUrl();
                    }
                  }}
                  placeholder={
                    settings.slackWebhookUrl ?? "https://hooks.slack.com/services/..."
                  }
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
                <Button
                  onClick={saveSlackUrl}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                >
                  Save
                </Button>
              </div>
              {settings.slackWebhookUrl && (
                <p className="text-xs text-zinc-500 mt-1">
                  Current: {settings.slackWebhookUrl}
                </p>
              )}
            </div>

            {/* Discord Webhook */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                Discord Webhook URL
              </label>
              <div className="flex gap-3">
                <input
                  type="url"
                  value={discordInput}
                  onChange={(e) => setDiscordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveDiscordUrl();
                    }
                  }}
                  placeholder={
                    settings.discordWebhookUrl ?? "https://discord.com/api/webhooks/..."
                  }
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
                <Button
                  onClick={saveDiscordUrl}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                >
                  Save
                </Button>
              </div>
              {settings.discordWebhookUrl && (
                <p className="text-xs text-zinc-500 mt-1">
                  Current: {settings.discordWebhookUrl}
                </p>
              )}
            </div>

            {/* Notify Toggles */}
            <div className="space-y-3 pt-2">
              <div
                role="button"
                tabIndex={0}
                onClick={toggleNotifyScheduled}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleNotifyScheduled();
                  }
                }}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 cursor-pointer transition-colors hover:border-zinc-700 select-none"
              >
                <div>
                  <p className="font-medium text-sm text-zinc-100">
                    Scheduled scan alerts
                  </p>
                  <p className="text-xs text-zinc-500">
                    Get notified when a scheduled scan completes
                  </p>
                </div>
                <div
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0 ${
                    settings.notifyOnScheduled ? "bg-emerald-600" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-200 ${
                      settings.notifyOnScheduled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={toggleNotifyCritical}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleNotifyCritical();
                  }
                }}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 cursor-pointer transition-colors hover:border-zinc-700 select-none"
              >
                <div>
                  <p className="font-medium text-sm text-zinc-100">
                    Critical finding alerts
                  </p>
                  <p className="text-xs text-zinc-500">
                    Get notified when CRITICAL or HIGH findings are detected
                  </p>
                </div>
                <div
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0 ${
                    settings.notifyOnCritical ? "bg-emerald-600" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-200 ${
                      settings.notifyOnCritical ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ---------- small helper component ---------- */

function SavedIndicator({ visible }: { visible: boolean }) {
  return (
    <span
      className={`text-xs font-medium text-emerald-400 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      Saved
    </span>
  );
}
