import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { RESTPostAPIWebhookWithTokenJSONBody } from "discord-api-types/v10";
import { MessageFlags, ButtonStyle } from "discord-api-types/v10";
import { EmbedBuilder, ContainerBuilder, TextDisplayBuilder, ButtonBuilder, SectionBuilder, SeparatorBuilder, ActionRowBuilder, MediaGalleryItemBuilder, MediaGalleryBuilder } from "@discordjs/builders";
import { env } from "./env";

export class GitHubRelease {
  private readonly name: string;
  private readonly time: Date;
  private readonly url: string;
  private readonly body: string;
  private readonly isPrerelease: boolean;
  private readonly author: { username: string; photo: string };

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
    this.author = {
      username: release.author.login,
      photo: release.author.avatar_url,
    };
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
    return this.isPrerelease ? `\`🚧\`  [${this.name}](${this.url})` : `\`📦\`  [${this.name}](${this.url})`;
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

    // the whole message content is measured, not just this field
    const BODY_MAX_LENGTH = 4000 - (`## ${this.getEmbedTitle()}`).length - this.getMessageContent().length;
    return markdown.length > BODY_MAX_LENGTH
      ? `${markdown.substring(0, BODY_MAX_LENGTH - 1)}…`
      : `${markdown}`;
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

  public async getMessage(): Promise<RESTPostAPIWebhookWithTokenJSONBody> {
    const blog = await this.getBlogPost();

    const container = new ContainerBuilder();
    container.setAccentColor(this.getEmbedColour());

    const fullChangelogButton = new ButtonBuilder()
      .setLabel("Full Changelog")
      .setStyle(ButtonStyle.Link)
      .setURL(this.url)
      .setEmoji({ id: "1119818837542576208", name: "GitHub" })

    // the github changelog is going to be massive, so if they made a blog post just use its og image and description
    if (blog) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`## ${this.getEmbedTitle()}`),
      );
      if (blog.url) {
        if (blog.og) container.addMediaGalleryComponents(
          new MediaGalleryBuilder()
            .addItems(new MediaGalleryItemBuilder().setURL(blog.og))
        );
        if (blog.description) container.addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(blog.description)
        );
        container.addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents([
            fullChangelogButton,
            new ButtonBuilder()
              .setLabel(blog.button.label)
              .setStyle(ButtonStyle.Link)
              .setURL(blog.url)
              .setEmoji(blog.button.emoji),
          ])
        );
      } else {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder()
                .setContent(`*waiting for nextjs blog post...*`),
            )
        ).addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>()
            .addComponents(fullChangelogButton)
        );

      }

      // otherwise use the github changelog
    } else {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder()
              .setContent(`## ${this.getEmbedTitle()}`),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel("Changelog")
              .setStyle(ButtonStyle.Link)
              .setURL(this.url)
              .setEmoji({ id: "1119818837542576208", name: "GitHub" })
          ),
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      const body = this.getEmbedBody();
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(body),
      );

      // if the content is really long, then add another button to view the full changelog
      if (body.endsWith("…")) {
        container.addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>()
            .addComponents(fullChangelogButton)
        );
      }
    }

    return {
      components: [
        new TextDisplayBuilder().setContent(this.getMessageContent()).toJSON(),
        container.toJSON()
      ],
      flags: MessageFlags.IsComponentsV2,
      allowed_mentions: {
        roles: [env.PRERELEASE_PING_ROLE_ID, env.RELEASE_PING_ROLE_ID].filter(Boolean) as string[],
      },
    }
  };

  public needsRefresh = false

  public async getBlogPost() {
    // edit this to whatever repo you want to check for a blog post
    // most don't have one, so just return null by default
    if (!this.url.startsWith("https://github.com/vercel/next.js/releases/tag/")) return null;

    // change this logic for how often you have a major release where the github changelog is not helpful
    const [major, minor, patch] = this.name.replace("v", "").split(".").map(Number);
    if (!this.isPrerelease && patch === 0) {
      const blogName = minor === 0 ? `next-${major}` : `next-${major}-${minor}`;

      const res = await fetch(`https://nextjs.org/blog/${blogName}`)
      if (!res.ok) {
        this.needsRefresh = true;
        return {};
      };

      const html = await res.text();
      const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
      const description = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];

      return {
        url: `https://nextjs.org/blog/${blogName}`,
        og,
        description,
        // Customize the button to whatever you want too
        button: {
          label: "Next.js Blog",
          emoji: { id: "753870953812983850", name: "next" }
        }
      };
    }
  }
}
