import { Octokit } from "@octokit/rest";
import { env } from "./env";
import { GitHubRelease } from "./github-release";
import type { RESTGetAPIChannelMessageResult } from "discord-api-types/v10";

class LastUpdatedStore {
  private readonly lastUpdated: Date;
  private updateMessageIds: Record<string, string> = {};
  public constructor() {
    this.lastUpdated = new Date();
  }
  public releaseIsNewer(release: GitHubRelease): boolean {
    return release.getTime() > this.lastUpdated || !!this.updateMessageIds[release.getTitle()];
  }
  public update(date = new Date(), messageIds?: Record<string, string>): void {
    this.lastUpdated.setTime(date.getTime());
    this.updateMessageIds = messageIds ?? {};
  }
  public getUpdateMessageId(release: GitHubRelease): string | undefined {
    return this.updateMessageIds[release.getTitle()];
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

  /** @returns The message id of the release if it needs to be refreshed, otherwise undefined */
  async postNewRelease(release: GitHubRelease, messageId?: string) {
    const url = messageId
      ? `${env.DISCORD_WEBHOOK}/messages/${messageId}?with_components=true&wait=true`
      : `${env.DISCORD_WEBHOOK}?with_components=true&wait=true`;

    const res = await fetch(url, {
      method: messageId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await release.getMessage()),
    });

    if (!res.ok) {
      console.error("Failed to post release", release.getTitle(), res.statusText, await res.text());
    }

    const json = await res.json() as RESTGetAPIChannelMessageResult;
    return json.id;
  }

  async check() {
    const t = new Date();
    console.log("Checking for new releases at", t.toISOString());
    const releases = await this.getNewReleases();
    const refreshMsgs: Record<string, string> = {};
    for (const release of releases) {
      console.log(">>>>>>>>>>> Posting release", release.getTitle());
      const possibleMsgId = this.lastUpdatedStore.getUpdateMessageId(release);
      // eslint-disable-next-line no-await-in-loop -- We want to ensure the order is correct
      const res = await this.postNewRelease(release, possibleMsgId);
      if (res && release.needsRefresh) refreshMsgs[release.getTitle()] = res;
    }
    this.lastUpdatedStore.update(t, refreshMsgs);
  }

  public async run() {
    console.log("Running on Bun", Bun.version);
    await this.check();
    setInterval(() => void this.check(), this.options.revalidate);
  }
}

new ReleaseChecker().run();
