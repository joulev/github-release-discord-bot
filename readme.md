# github-release-discord-bot

A simple Discord bot to track releases in any GitHub repositories.

Intended to replace the existing bot in the Next.js Discord server which is not working well.

## How it works

It doesn't require the repository owner to configure anything. Instead it just polls the GitHub API in a short interval and post any new releases it finds.

## Set up

1. Register a Discord bot and add it to the server with the "Send Messages" permission.

2. Add the necessary environment variables:

   - `DISCORD_TOKEN`: The bot token
   - `RELEASE_CHANNEL_ID`: The release channel ID where the bot will post messages
   - `REPO_OWNER`: The owner of the GitHub repository (e.g. `vercel`)
   - `REPO_NAME`: The name of the GitHub repository (e.g. `next.js`)
   - `GITHUB_TOKEN` (optional): A GitHub personal access token (with the **repo** scope) to access the repository (only necessary if the repository is not public)

3. The classic steps: `pnpm install`, `pnpm dev` for development, `pnpm build && pnpm start` for deployment.
