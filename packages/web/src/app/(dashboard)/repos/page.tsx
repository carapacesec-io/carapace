"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSearchParams } from "next/navigation";

interface RepoData {
  githubId: number;
  fullName: string;
  language: string | null;
  defaultBranch: string;
  private: boolean;
  connected: boolean;
  active: boolean;
  installationId: number;
}

interface ConnectedRepo {
  id: string;
  githubId: number;
  fullName: string;
  language: string | null;
  defaultBranch: string;
  isActive: boolean;
  installationId: number;
  _count: { scans: number };
}

const GITHUB_APP_NAME = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || "stealth-cleaner";

export default function ReposPage() {
  const searchParams = useSearchParams();
  const [connectedRepos, setConnectedRepos] = useState<ConnectedRepo[]>([]);
  const [availableRepos, setAvailableRepos] = useState<RepoData[]>([]);
  const [hasInstallation, setHasInstallation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const installedCount = searchParams.get("installed");
  const error = searchParams.get("error");

  useEffect(() => {
    fetchRepos();
  }, []);

  async function fetchRepos() {
    setLoading(true);
    try {
      const [connectedRes, githubRes] = await Promise.all([
        fetch("/api/repos"),
        fetch("/api/github/repos"),
      ]);

      if (connectedRes.ok) {
        setConnectedRepos(await connectedRes.json());
      }

      if (githubRes.ok) {
        const data = await githubRes.json();
        setAvailableRepos(data.repos || []);
        setHasInstallation(data.hasInstallation);
      }
    } catch (err) {
      console.error("Failed to fetch repos:", err);
    } finally {
      setLoading(false);
    }
  }

  async function connectRepo(repo: RepoData) {
    setActionLoading(repo.githubId);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: repo.installationId,
          githubId: repo.githubId,
          fullName: repo.fullName,
          language: repo.language,
          defaultBranch: repo.defaultBranch,
        }),
      });

      if (res.ok) {
        await fetchRepos();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function disconnectRepo(repoId: string) {
    setActionLoading(-1);
    try {
      const res = await fetch("/api/repos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId }),
      });

      if (res.ok) {
        await fetchRepos();
      }
    } finally {
      setActionLoading(null);
    }
  }

  const connectedIds = new Set(connectedRepos.filter((r) => r.isActive).map((r) => r.githubId));
  const unconnectedRepos = availableRepos.filter((r) => !connectedIds.has(r.githubId));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Repositories</h1>
          <p className="text-muted-foreground mt-1">
            Connect repositories to enable automatic PR reviews
          </p>
        </div>
        <a
          href={`https://github.com/apps/${GITHUB_APP_NAME}/installations/new`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Install GitHub App
          </Button>
        </a>
      </div>

      {/* Status Messages */}
      {installedCount && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-400">
          GitHub App installed successfully. {installedCount} repositories imported.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error === "missing_installation"
            ? "Installation ID missing. Please try installing the GitHub App again."
            : "Setup failed. Please try again."}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading repositories...</div>
      ) : (
        <>
          {/* Connected Repos */}
          {connectedRepos.filter((r) => r.isActive).length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Connected Repositories</h2>
              <div className="grid gap-3">
                {connectedRepos
                  .filter((r) => r.isActive)
                  .map((repo) => (
                    <Card key={repo.id} className="bg-zinc-950 border-zinc-800">
                      <CardHeader className="flex flex-row items-center justify-between py-4">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{repo.fullName}</CardTitle>
                          <div className="flex items-center gap-2">
                            {repo.language && (
                              <Badge variant="secondary" className="text-xs">
                                {repo.language}
                              </Badge>
                            )}
                            <Badge variant="default" className="text-xs">Active</Badge>
                            <span className="text-xs text-muted-foreground">
                              {repo._count.scans} scans
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => disconnectRepo(repo.id)}
                          disabled={actionLoading !== null}
                        >
                          Disconnect
                        </Button>
                      </CardHeader>
                    </Card>
                  ))}
              </div>
            </div>
          )}

          {/* Available Repos */}
          {unconnectedRepos.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Available Repositories</h2>
              <p className="text-sm text-muted-foreground">
                These repos are accessible via your GitHub App installation. Connect them to enable automatic PR reviews.
              </p>
              <div className="grid gap-3">
                {unconnectedRepos.map((repo) => (
                  <Card key={repo.githubId} className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between py-4">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{repo.fullName}</CardTitle>
                        <div className="flex items-center gap-2">
                          {repo.language && (
                            <Badge variant="secondary" className="text-xs">
                              {repo.language}
                            </Badge>
                          )}
                          {repo.private && (
                            <Badge variant="outline" className="text-xs">Private</Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => connectRepo(repo)}
                        disabled={actionLoading === repo.githubId}
                      >
                        {actionLoading === repo.githubId ? "Connecting..." : "Connect"}
                      </Button>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* No Installation */}
          {!hasInstallation && connectedRepos.length === 0 && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardContent className="text-center py-12">
                <div className="mx-auto w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                </div>
                <p className="text-lg font-medium">No repositories connected</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Install the Carapace GitHub App on your repositories to enable automatic
                  automated code reviews on every pull request.
                </p>
                <a
                  href={`https://github.com/apps/${GITHUB_APP_NAME}/installations/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="mt-4">Install GitHub App</Button>
                </a>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
