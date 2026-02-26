import { Octokit } from "octokit";

export interface RepoInfo {
  fullName: string;
  githubId: number;
  defaultBranch: string;
  language: string | null;
}

function getOctokit(): Octokit {
  const token = process.env.GITHUB_BULK_SCAN_PAT;
  return token ? new Octokit({ auth: token }) : new Octokit();
}

/** Wait ms, used for rate-limit pacing. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Paginate a GitHub search query, returning up to `limit` repos.
 * Handles the 1,000-result ceiling and 403 rate-limit retries.
 */
async function paginateSearch(
  octokit: Octokit,
  q: string,
  limit: number,
  sort: "stars" | "updated" = "stars",
): Promise<RepoInfo[]> {
  const results: RepoInfo[] = [];
  const seen = new Set<number>();
  const maxPages = Math.min(10, Math.ceil(limit / 100)); // GitHub caps at 1,000 results

  for (let page = 1; page <= maxPages; page++) {
    if (results.length >= limit) break;

    try {
      const { data } = await octokit.rest.search.repos({
        q,
        sort,
        order: "desc",
        per_page: 100,
        page,
      });

      if (data.items.length === 0) break;

      for (const r of data.items) {
        if (seen.has(r.id) || results.length >= limit) continue;
        seen.add(r.id);
        results.push({
          fullName: r.full_name,
          githubId: r.id,
          defaultBranch: r.default_branch,
          language: r.language,
        });
      }

      if (data.items.length < 100) break;

      // Pace requests: 3 sec between calls, rate-limit handler retries on 403/429
      await sleep(3_000);
    } catch (err: any) {
      if (err.status === 403 || err.status === 429) {
        // Rate limited — wait 60 seconds and retry this page
        await sleep(60_000);
        page--;
        continue;
      }
      if (err.status === 422) break; // GitHub returns 422 when offset > 1000
      throw err;
    }
  }

  return results;
}

export async function fetchTrendingRepos(
  language?: string,
  count = 50,
): Promise<RepoInfo[]> {
  const octokit = getOctokit();
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const dateStr = since.toISOString().split("T")[0];

  let q = `created:>${dateStr} stars:>10`;
  if (language) q += ` language:${language}`;

  return paginateSearch(octokit, q, count);
}

export async function fetchTopReposByStars(
  language?: string,
  count = 50,
): Promise<RepoInfo[]> {
  const octokit = getOctokit();

  // For small counts, a single query works
  if (count <= 1000) {
    let q = "stars:>100";
    if (language) q += ` language:${language}`;
    return paginateSearch(octokit, q, count);
  }

  // For large counts (>1000), split into star-range buckets.
  // GitHub Search API caps at 1,000 results per query, so we slice by star ranges.
  const starRanges = [
    { q: "stars:>=50000" },
    { q: "stars:10000..49999" },
    { q: "stars:5000..9999" },
    { q: "stars:2000..4999" },
    { q: "stars:1000..1999" },
    { q: "stars:500..999" },
    { q: "stars:200..499" },
    { q: "stars:100..199" },
  ];

  const allRepos: RepoInfo[] = [];
  const seenIds = new Set<number>();

  for (const range of starRanges) {
    if (allRepos.length >= count) break;

    let q = range.q;
    if (language) q += ` language:${language}`;

    const remaining = count - allRepos.length;
    const batch = await paginateSearch(octokit, q, Math.min(remaining, 1000));

    for (const repo of batch) {
      if (!seenIds.has(repo.githubId) && allRepos.length < count) {
        seenIds.add(repo.githubId);
        allRepos.push(repo);
      }
    }
  }

  return allRepos;
}

export async function fetchReposBySearch(
  query: string,
  count = 50,
): Promise<RepoInfo[]> {
  const octokit = getOctokit();
  return paginateSearch(octokit, query, count);
}
