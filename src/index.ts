import { Octokit } from "@octokit/rest";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "./env.js";

const botClient = new Client({ intents: [GatewayIntentBits.Guilds] });
botClient.once(Events.ClientReady, main);
botClient.login(env.DISCORD_TOKEN);

const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

interface GitHubRelease {
  name: string | null;
  time: Date;
  url: string;
  body: string | null | undefined;
}

class LastUpdatedStore {
  private readonly lastUpdated: Date;
  public constructor() {
    this.lastUpdated = new Date();
  }
  public get(): Date {
    return this.lastUpdated;
  }
  public update(): void {
    this.lastUpdated.setTime(Date.now());
  }
}

async function getNewReleases(lastUpdatedStore: LastUpdatedStore): Promise<GitHubRelease[]> {
  const lastUpdated = lastUpdatedStore.get();
  const releases = await octokit.repos
    .listReleases({ owner: env.REPO_OWNER, repo: env.REPO_NAME })
    .then(res =>
      res.data.map(release => ({
        name: release.name,
        time: release.published_at ? new Date(release.published_at) : null,
        url: release.html_url,
        body: release.body,
      })),
    );
  return releases.filter((release): release is GitHubRelease => {
    if (release.time === null) return false;
    return release.time > lastUpdated;
  });
}

async function postNewRelease(client: Client<true>, release: GitHubRelease) {
  const releaseChannel = client.channels.cache.get(env.RELEASE_CHANNEL_ID);
  if (!releaseChannel || !releaseChannel.isTextBased()) {
    console.error("Release channel is invalid");
    return;
  }
  await releaseChannel.send(`**${release.name}**\n${release.url}\n${release.body}`);
}

async function check(client: Client<true>, lastUpdatedStore: LastUpdatedStore) {
  const releases = await getNewReleases(lastUpdatedStore);
  for (const release of releases.sort((a, b) => a.time.getTime() - b.time.getTime())) {
    // eslint-disable-next-line no-await-in-loop -- We want to ensure the order is correct
    await postNewRelease(client, release);
  }
  lastUpdatedStore.update();
}

async function main(client: Client<true>) {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  const lastUpdatedStore = new LastUpdatedStore();
  await check(client, lastUpdatedStore);

  const ONE_MINUTE = 1000 * 60;
  setInterval(() => void check(client, lastUpdatedStore), ONE_MINUTE);
}
