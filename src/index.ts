import { Octokit } from "@octokit/rest";
import { env } from "./env";
import { GitHubRelease } from "./github-release";

class LastUpdatedStore {
  private readonly lastUpdated: Date;
  public constructor() {
    this.lastUpdated = new Date();
  }
  public releaseIsNewer(release: GitHubRelease): boolean {
    return release.getTime() > this.lastUpdated;
  }
  public update(): void {
    this.lastUpdated.setTime(Date.now());
  }
}

class ReleaseChecker {
  private readonly octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  private readonly lastUpdatedStore = new LastUpdatedStore();

  options = {
    maxItems: 2,
    revalidate: 1000 * 60, // 1 minute
  };

  async getNewReleases(): Promise<GitHubRelease[]> {
    const res = await this.octokit.repos.listReleases({
      owner: env.REPO_OWNER,
      repo: env.REPO_NAME,
    });

    if (process.env.NODE_ENV === "development")
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- choose a repo that already has releases
      return [new GitHubRelease(res.data[0]!)];

    return res.data
      .map(release => new GitHubRelease(release))
      .filter(release => this.lastUpdatedStore.releaseIsNewer(release))
      .sort((a, b) => b.getTime().valueOf() - a.getTime().valueOf()) // recent first
      .slice(0, this.options.maxItems)
      .reverse(); // we need to post the oldest first
  }

  async postNewRelease(release: GitHubRelease) {
    await fetch(env.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(release.getMessage()),
    });
  }

  async check() {
    console.log("Checking for new releases at", new Date().toISOString());
    const releases = await this.getNewReleases();
    for (const release of releases) {
      console.log(">>>>>>>>>>> Posting release", release.getTitle());
      // eslint-disable-next-line no-await-in-loop -- We want to ensure the order is correct
      await this.postNewRelease(release);
    }
    this.lastUpdatedStore.update();
  }

  public async run() {
    await this.check();
    setInterval(() => void this.check(), this.options.revalidate);
  }
}

new ReleaseChecker().run();
