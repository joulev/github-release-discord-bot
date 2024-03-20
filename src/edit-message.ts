import { Octokit } from "@octokit/rest";
import { env } from "./env";
import { GitHubRelease } from "./github-release";

// Change the following two values
const MESSAGE_ID = "1219816027043659798";
const TAG_NAME = "v14.1.4";

async function main() {
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const { data } = await octokit.repos.getReleaseByTag({
    owner: env.REPO_OWNER,
    repo: env.REPO_NAME,
    tag: TAG_NAME,
  });
  const release = new GitHubRelease(data);
  const res = await fetch(`${env.DISCORD_WEBHOOK}/messages/${MESSAGE_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(release.getMessage()),
  });
  console.log(res.ok ? "Successfully updated the message" : "Failed to update the message");
}

main();
