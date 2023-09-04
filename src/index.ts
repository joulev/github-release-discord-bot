import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  type MessageCreateOptions,
} from "discord.js";
import { env } from "./env.js";

class GitHubRelease {
  private readonly name: string;
  private readonly time: Date;
  private readonly url: string;
  private readonly body: string;
  private readonly isPrerelease: boolean;

  private static readonly STABLE_COLOUR = "#0072F7";
  private static readonly PRERELEASE_COLOUR = "#FFB11A";

  public constructor(
    release: RestEndpointMethodTypes["repos"]["listReleases"]["response"]["data"][number],
  ) {
    this.name = release.name ?? "Release name not provided";
    this.time = release.published_at ? new Date(release.published_at) : new Date();
    this.url = release.html_url;
    this.body = release.body ?? "Release body not provided";
    this.isPrerelease = release.prerelease;
  }

  private getMessageContent() {
    if (this.isPrerelease) {
      return env.PRERELEASE_PING_ROLE_ID
        ? `<@&${env.PRERELEASE_PING_ROLE_ID}>: ${this.name}`
        : `New prerelease: ${this.name}!`;
    }
    return env.RELEASE_PING_ROLE_ID
      ? `<@&${env.RELEASE_PING_ROLE_ID}>: ${this.name}`
      : `New release: ${this.name}!`;
  }

  private getEmbedTitle() {
    return this.isPrerelease ? `🚧 ${this.name}` : `📦 ${this.name}`;
  }

  private getEmbedBody() {
    const repoLink = `https://github.com/${env.REPO_NAME}/${env.REPO_OWNER}`;
    return (
      this.body
        // PR number: #123
        .replace(/#(\d+)/g, `[#$1](<${repoLink}/pulls/$1>)`)
        // Username: @test
        .replace(/@([a-zA-Z0-9-]+)/g, `[@$1](<https://github.com/$1>)`)
        // Commit hash
        .replace(
          /[a-f0-9]{40}/g,
          value => `[${value.substring(0, 7)}](<${repoLink}/commit/${value}>)`,
        )
    );
  }

  private getEmbedColour() {
    return this.isPrerelease ? GitHubRelease.PRERELEASE_COLOUR : GitHubRelease.STABLE_COLOUR;
  }

  public getTime() {
    return this.time;
  }

  public getMessage(): MessageCreateOptions {
    return {
      content: this.getMessageContent(),
      embeds: [
        new EmbedBuilder()
          .setTitle(this.getEmbedTitle())
          .setURL(this.url)
          .setDescription(this.getEmbedBody())
          .setColor(this.getEmbedColour()),
      ],
    };
  }
}

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
    const res = await this.octokit.repos.listReleases({
      owner: env.REPO_OWNER,
      repo: env.REPO_NAME,
    });
    return res.data
      .map(release => new GitHubRelease(release))
      .filter(release => this.lastUpdatedStore.releaseIsNewer(release));
  }

  async postNewRelease(release: GitHubRelease) {
    const releaseChannel = this.client.channels.cache.get(env.RELEASE_CHANNEL_ID);
    if (!releaseChannel || !releaseChannel.isTextBased()) {
      console.error("Release channel is invalid");
      return;
    }
    await releaseChannel.send(release.getMessage());
  }

  async check() {
    const releases = await this.getNewReleases();
    for (const release of releases.sort((a, b) => a.getTime().valueOf() - b.getTime().valueOf())) {
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
