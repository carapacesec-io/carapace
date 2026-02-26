/**
 * Git Trees API helper.
 *
 * Creates an atomic commit on a GitHub branch using the Git Trees API:
 *   1. Create blobs for each fixed file
 *   2. Create a tree referencing those blobs
 *   3. Create a commit pointing to the tree
 *   4. Update the branch ref
 *
 * All-or-nothing: if any step fails, nothing is committed.
 */

import type { Octokit } from "octokit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileChange {
  /** Path relative to repo root. */
  path: string;
  /** New file content (UTF-8). */
  content: string;
}

export interface CommitFixesOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
  /** Branch name to push to (e.g. "fix/auto-fixes"). */
  branch: string;
  /** SHA of the current HEAD commit on the branch. */
  baseSha: string;
  /** Files to create/update. */
  files: FileChange[];
  /** Commit message. */
  message: string;
}

export interface CommitFixesResult {
  /** The SHA of the new commit. */
  commitSha: string;
  /** Number of files changed. */
  filesChanged: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function commitFixes(
  options: CommitFixesOptions,
): Promise<CommitFixesResult> {
  const { octokit, owner, repo, branch, baseSha, files, message } = options;

  if (files.length === 0) {
    throw new Error("No files to commit");
  }

  // 1. Create blobs for each file
  const blobPromises = files.map(async (file) => {
    const { data } = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(file.content, "utf-8").toString("base64"),
      encoding: "base64",
    });
    return { path: file.path, sha: data.sha };
  });

  const blobs = await Promise.all(blobPromises);

  // 2. Create a tree
  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseSha,
    tree: blobs.map((blob) => ({
      path: blob.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: blob.sha,
    })),
  });

  // 3. Create a commit
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [baseSha],
  });

  // 4. Update the branch ref
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.sha,
  });

  return {
    commitSha: commit.sha,
    filesChanged: files.length,
  };
}
