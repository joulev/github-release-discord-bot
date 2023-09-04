import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

config();

export const env = createEnv({
  server: {
    DISCORD_WEBHOOK: z.string().min(1),
    GITHUB_TOKEN: z.string().min(1).optional(),
    REPO_OWNER: z.string().min(1),
    REPO_NAME: z.string().min(1),
    RELEASE_PING_ROLE_ID: z.string().min(1).optional(),
    PRERELEASE_PING_ROLE_ID: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
});
