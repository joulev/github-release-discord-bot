# github-release-discord-bot

A simple Discord webhook-based bot to track releases in any GitHub repositories.

This is the current bot running in #releases in the Next.js Discord server.

<img width="594" alt="Screenshot" src="https://github.com/joulev/github-release-discord-bot/assets/44609036/4f286646-374b-4c18-a4d6-e0007b72f652">

## How it works

It doesn't require the repository owner to configure anything. Instead it just polls the GitHub API in a short interval and post any new releases it finds.

## Set up

1. In your server, add a channel for the bot to send messages in.

2. Create a webhook in the channel

3. Add the necessary environment variables:

   - `DISCORD_WEBHOOK`: The webhook URL above
   - `REPO_OWNER`: The owner of the GitHub repository (e.g. `vercel`)
   - `REPO_NAME`: The name of the GitHub repository (e.g. `next.js`)
   - `GITHUB_TOKEN` (optional): A GitHub personal access token (with the **repo** scope) to access the repository (only necessary if the repository is not public)
   - `RELEASE_PING_ROLE_ID` and `PRERELEASE_PING_ROLE_ID`: The ping role IDs if you want the bot to ping. The channel also needs the "Mention Everyone" permission for the bot to work.

4. The classic steps: `bun install`, `bun dev` for development, `bun start` for deployment.
