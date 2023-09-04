import { Octokit } from "@octokit/rest";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "./env.js";

interface GitHubRelease {
  name: string | null;
  time: Date;
  url: string;
  body: string | null | undefined;
  isPrerelease: boolean;
}

class LastUpdatedStore {
  private readonly lastUpdated: Date;
  public constructor() {
    this.lastUpdated = new Date();
  }
  public releaseIsNewer(release: GitHubRelease): boolean {
    return release.time > this.lastUpdated;
  }
  public update(): void {
    this.lastUpdated.setTime(Date.now());
  }
}

class ReleaseChecker {
  private readonly client: Client<true>;
  private readonly octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  private readonly lastUpdatedStore = new LastUpdatedStore();

  options = {
    revalidate: 1000 * 60, // 1 minute
  };

  public constructor(client: Client<true>) {
    this.client = client;
  }

  async getNewReleases(): Promise<GitHubRelease[]> {
    const releases = await this.octokit.repos
      .listReleases({ owner: env.REPO_OWNER, repo: env.REPO_NAME })
      .then(res =>
        res.data.map(release => ({
          name: release.name,
          time: release.published_at ? new Date(release.published_at) : null,
          url: release.html_url,
          body: release.body,
          isPrerelease: release.prerelease,
        })),
      );
    return releases
      .filter((release): release is GitHubRelease => release.time !== null)
      .filter(release => this.lastUpdatedStore.releaseIsNewer(release));
  }

  async postNewRelease(release: GitHubRelease) {
    const releaseChannel = this.client.channels.cache.get(env.RELEASE_CHANNEL_ID);
    if (!releaseChannel || !releaseChannel.isTextBased()) {
      console.error("Release channel is invalid");
      return;
    }
    await releaseChannel.send(
      `**${release.name}${release.isPrerelease ? " (prerelease)" : ""}**\n${release.url}\n${
        release.body
      }`,
    );
  }

  async check() {
    const releases = await this.getNewReleases();
    for (const release of releases.sort((a, b) => a.time.getTime() - b.time.getTime())) {
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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  new ReleaseChecker(c).run();
});
client.login(env.DISCORD_TOKEN);
