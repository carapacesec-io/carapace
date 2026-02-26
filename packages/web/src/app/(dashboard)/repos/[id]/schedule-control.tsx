"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Schedule {
  scheduleEnabled: boolean;
  scheduleCron: string | null;
  scheduleTimezone: string;
  lastScheduledAt: string | null;
}

const PRESETS: { label: string; cron: string }[] = [
  { label: "Daily (2 AM)", cron: "0 2 * * *" },
  { label: "Weekly (Mon 2 AM)", cron: "0 2 * * 1" },
  { label: "Twice a week (Mon/Thu)", cron: "0 2 * * 1,4" },
];

export default function ScheduleControl({ repoId }: { repoId: string }) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customCron, setCustomCron] = useState("");
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
        const res = await fetch(`/api/repos/${repoId}/schedule`);
        if (!res.ok) throw new Error();
        const data: Schedule = await res.json();
        setSchedule(data);
        setCustomCron(data.scheduleCron ?? "");
      } catch {
        // Ignore - will show default state
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

  const save = async (patch: Partial<Schedule>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/repos/${repoId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleEnabled: schedule?.scheduleEnabled ?? false,
          scheduleCron: schedule?.scheduleCron ?? null,
          scheduleTimezone: schedule?.scheduleTimezone ?? "UTC",
          ...patch,
        }),
      });
      if (!res.ok) throw new Error();
      const data: Schedule = await res.json();
      setSchedule(data);
      setCustomCron(data.scheduleCron ?? "");
      flash();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = () => {
    if (!schedule) return;
    const next = !schedule.scheduleEnabled;
    const cron = next ? (schedule.scheduleCron || "0 2 * * *") : schedule.scheduleCron;
    setSchedule({ ...schedule, scheduleEnabled: next, scheduleCron: cron });
    save({ scheduleEnabled: next, scheduleCron: cron });
  };

  const selectPreset = (cron: string) => {
    if (!schedule) return;
    setSchedule({ ...schedule, scheduleCron: cron, scheduleEnabled: true });
    setCustomCron(cron);
    save({ scheduleCron: cron, scheduleEnabled: true });
  };

  const saveCustom = () => {
    if (!customCron.trim()) return;
    save({ scheduleCron: customCron.trim(), scheduleEnabled: true });
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

  const enabled = schedule?.scheduleEnabled ?? false;
  const currentCron = schedule?.scheduleCron ?? null;

  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-zinc-100">Scheduled Scans</CardTitle>
            <CardDescription className="text-zinc-400">
              Automatically scan this repo on a schedule
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
        {/* Enable toggle */}
        <div
          role="button"
          tabIndex={0}
          onClick={toggleEnabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleEnabled();
            }
          }}
          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 cursor-pointer transition-colors hover:border-zinc-700 select-none"
        >
          <div>
            <p className="font-medium text-sm text-zinc-100">
              Enable scheduled scans
            </p>
            <p className="text-xs text-zinc-500">
              {enabled
                ? `Running on schedule: ${currentCron}`
                : "Scans only run on PR or manual trigger"}
            </p>
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

        {/* Frequency presets */}
        {enabled && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-300">Frequency</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.cron}
                  type="button"
                  onClick={() => selectPreset(preset.cron)}
                  disabled={saving}
                  className={`px-4 py-2 rounded-md text-xs font-semibold transition-all duration-200 border ${
                    currentCron === preset.cron
                      ? "bg-emerald-600 text-white border-transparent ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-950"
                      : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom cron */}
            <div>
              <p className="text-xs text-zinc-500 mb-1.5">
                Or enter a custom cron expression:
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveCustom();
                    }
                  }}
                  placeholder="0 2 * * *"
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
                <Button
                  onClick={saveCustom}
                  disabled={saving || !customCron.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Last/Next info */}
        {schedule?.lastScheduledAt && (
          <p className="text-xs text-zinc-500">
            Last scheduled scan:{" "}
            {new Date(schedule.lastScheduledAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
