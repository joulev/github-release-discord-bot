import { Octokit } from "@octokit/rest";
import type { RESTGetAPIChannelMessageResult } from "discord-api-types/v10";
import { env } from "./env";
import { GitHubRelease } from "./github-release";

class LastUpdatedStore {
  private readonly lastUpdated: Date;

  // Recently posted messages to continue tracking for changes from upstream
  private readonly postedMessages: Map<string, { id: string; date: Date; json: string }>;

  // We only track changes for the last 24 hours
  private readonly CLEANUP_CUTOFF_MS = 1000 * 60 * 60 * 24; // 1 day

  public constructor() {
    this.lastUpdated = new Date();
    this.postedMessages = new Map();
  }

  public releaseShouldBeProcessed(release: GitHubRelease): boolean {
    return release.getTime() > this.lastUpdated || this.postedMessages.has(release.getTitle());
  }
  public getPostedMessage(release: GitHubRelease) {
    return this.postedMessages.get(release.getTitle());
  }
  public hasPostedMessage(release: GitHubRelease) {
    return this.postedMessages.has(release.getTitle());
  }
  public setPostedMessage(release: GitHubRelease, message: { id: string; json: string }): void {
    this.postedMessages.set(release.getTitle(), { ...message, date: new Date() });
  }
  public updateTime(): void {
    const now = new Date();
    this.lastUpdated.setTime(now.getTime());

    // Cleanup
    const CLEANUP_CUTOFF = new Date(now.getTime() - this.CLEANUP_CUTOFF_MS);
    for (const [key, message] of this.postedMessages.entries()) {
      if (message.date.getTime() < CLEANUP_CUTOFF.getTime()) this.postedMessages.delete(key);
    }
  }
}

class ReleaseChecker {
  private readonly octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  private readonly lastUpdatedStore = new LastUpdatedStore();

  options = {
    revalidate: 1000 * 60, // 1 minute
  };

  async getNewReleases(): Promise<GitHubRelease[]> {
    const res = await this.octokit.repos.listReleases({
      owner: env.REPO_OWNER,
      repo: env.REPO_NAME,
      page: 1,
      per_page: 10,
    });

    if (process.env.NODE_ENV === "development")
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- choose a repo that already has releases
      return [new GitHubRelease(res.data[0]!)];

    return res.data
      .map(release => new GitHubRelease(release))
      .filter(release => this.lastUpdatedStore.releaseShouldBeProcessed(release))
      .sort((a, b) => b.getTime().valueOf() - a.getTime().valueOf()) // recent first
      .reverse(); // we need to post the oldest first
  }

  async postNewRelease(release: GitHubRelease) {
    const jsonContent = JSON.stringify(release.getMessage());

    console.log(">>>>>>>>>>> Posting release", release.getTitle());

    const response = await fetch(`${env.DISCORD_WEBHOOK}?with_components=true&wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonContent,
    });
    const responseJson = (await response.json()) as RESTGetAPIChannelMessageResult;
    this.lastUpdatedStore.setPostedMessage(release, { id: responseJson.id, json: jsonContent });
  }

  async updateRelease(release: GitHubRelease) {
    const postedMessage = this.lastUpdatedStore.getPostedMessage(release);
    if (!postedMessage) return;

    const jsonContent = JSON.stringify(release.getMessage());
    if (jsonContent === postedMessage.json) return;

    console.log(">>>>>>>>>>> Updating release", release.getTitle());

    const response = await fetch(
      `${env.DISCORD_WEBHOOK}/messages/${postedMessage.id}?with_components=true&wait=true`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: jsonContent,
      },
    );
    const responseJson = (await response.json()) as RESTGetAPIChannelMessageResult;
    this.lastUpdatedStore.setPostedMessage(release, { id: responseJson.id, json: jsonContent });
  }

  async handleRelease(release: GitHubRelease) {
    if (this.lastUpdatedStore.hasPostedMessage(release)) {
      await this.updateRelease(release);
    } else {
      await this.postNewRelease(release);
    }
  }

  async check() {
    console.log("Checking for new releases at", new Date().toISOString());
    const releases = await this.getNewReleases();
    for (const release of releases) {
      // eslint-disable-next-line no-await-in-loop -- We want to ensure the order is correct
      await this.handleRelease(release);
    }
    this.lastUpdatedStore.updateTime();
  }

  public async run() {
    console.log("Running on Bun", Bun.version);
    await this.check();
    setInterval(() => void this.check(), this.options.revalidate);
  }
}

new ReleaseChecker().run();
