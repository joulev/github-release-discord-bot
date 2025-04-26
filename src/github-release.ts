import type { RestEndpointMethodTypes } from "@octokit/rest";
import {
  MessageFlags,
  ButtonStyle,
  type RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  SectionBuilder,
  SeparatorBuilder,
} from "@discordjs/builders";
import { env } from "./env";

export class GitHubRelease {
  private readonly name: string;
  private readonly time: Date;
  private readonly url: string;
  private readonly body: string;
  private readonly isPrerelease: boolean;
  private readonly numberOfContributors: number;

  private static readonly STABLE_COLOUR = 0x0072f7;
  private static readonly PRERELEASE_COLOUR = 0xffb11a;

  public constructor(
    release: RestEndpointMethodTypes["repos"]["listReleases"]["response"]["data"][number],
  ) {
    this.name = release.tag_name;
    this.time = release.published_at ? new Date(release.published_at) : new Date();
    this.url = release.html_url;
    this.body = release.body || "Release body not provided";
    this.isPrerelease = release.prerelease;
    this.numberOfContributors = release.mentions_count ?? 0;
  }

  private getMessageContent() {
    if (this.isPrerelease) {
      return env.PRERELEASE_PING_ROLE_ID
        ? `<@&${env.PRERELEASE_PING_ROLE_ID}> ${this.name}`
        : `New prerelease: ${this.name}`;
    }
    return env.RELEASE_PING_ROLE_ID
      ? `<@&${env.RELEASE_PING_ROLE_ID}> ${this.name}`
      : `New release: ${this.name}`;
  }

  private getEmbedTitle() {
    return this.isPrerelease
      ? `## 🚧  [${this.name}](${this.url})`
      : `## 📦  [${this.name}](${this.url})`;
  }

  private getMaxBodyLength() {
    // the whole message content is measured, not just this field
    return 4000 - this.getEmbedTitle().length - this.getMessageContent().length;
  }

  private getTruncatedEmbedBody(content: string) {
    const maxLength = this.getMaxBodyLength();
    return content.length > maxLength ? `${content.substring(0, maxLength - 1)}…` : content;
  }

  private getEmbedBody() {
    const repoLink = `https://github.com/${env.REPO_OWNER}/${env.REPO_NAME}`;

    const CREDIT_SECTION_MARKER = "Huge thanks to";

    const markdown = this.body
      // GFM callouts: [!NOTE] => **Note**, [!HELLO WORLD] => **Hello world**
      // with emojis where applicable
      .replace(/\[!([A-Z]+)\]/, (_, p1: string) => {
        function getEmoji(type: string) {
          switch (type) {
            case "NOTE":
              return "ℹ️ ";
            case "TIP":
              return "💡 ";
            case "IMPORTANT":
              return "❗️ ";
            case "WARNING":
              return "⚠️ ";
            case "CAUTION":
              return "🛑 ";
            default:
              return "";
          }
        }
        return `${getEmoji(p1)}**${p1.charAt(0) + p1.slice(1).toLowerCase()}**\n> `;
      })
      // PR number: #123
      .replace(/#(\d+)/g, `[#$1](${repoLink}/pull/$1)`)
      // Username: @test
      .split(CREDIT_SECTION_MARKER)
      .map((value, index) =>
        index === 1 ? value.replace(/@([a-zA-Z0-9-]+)/g, `[@$1](https://github.com/$1)`) : value,
      )
      .join(CREDIT_SECTION_MARKER)
      // Commit hash
      .replace(/[a-f0-9]{40}/g, value => `[${value.substring(0, 7)}](${repoLink}/commit/${value})`)
      // Remove blank lines
      .replace(/(\r|\n|\r\n)+/g, "\n")
      // Remove leading and trailing whitespaces
      .trim();

    const maxLength = this.getMaxBodyLength();
    const tooLong = markdown.length > maxLength;
    if (!tooLong) return this.getTruncatedEmbedBody(markdown);

    const creditSectionOnly = markdown.split(CREDIT_SECTION_MARKER)[1];
    if (!creditSectionOnly) return this.getTruncatedEmbedBody(markdown);

    const creditOnlyContent = `Please refer to the full changelog on GitHub.\n### Credits\n${CREDIT_SECTION_MARKER}${creditSectionOnly}`;
    if (creditOnlyContent.length > maxLength)
      return `Please refer to the full changelog on GitHub.\nHuge thanks to ${this.numberOfContributors} contributors for helping!`;

    return this.getTruncatedEmbedBody(creditOnlyContent);
  }

  private getEmbedColour() {
    return this.isPrerelease ? GitHubRelease.PRERELEASE_COLOUR : GitHubRelease.STABLE_COLOUR;
  }

  public getTitle() {
    return this.name;
  }

  public getTime() {
    return this.time;
  }

  public getMessage(): RESTPostAPIWebhookWithTokenJSONBody {
    const container = new ContainerBuilder();
    container.setAccentColor(this.getEmbedColour());
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(this.getEmbedTitle()))
        .setButtonAccessory(
          new ButtonBuilder().setLabel("Changelog").setStyle(ButtonStyle.Link).setURL(this.url),
        ),
    );
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(this.getEmbedBody()));

    return {
      components: [
        new TextDisplayBuilder().setContent(this.getMessageContent()).toJSON(),
        container.toJSON(),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowed_mentions: {
        roles: [env.PRERELEASE_PING_ROLE_ID, env.RELEASE_PING_ROLE_ID].filter(Boolean) as string[],
      },
    };
  }
}
