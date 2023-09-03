import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

config();

export const env = createEnv({
  server: {
    DISCORD_TOKEN: z.string().min(1),
    RELEASE_CHANNEL_ID: z.string().min(1),
    GITHUB_TOKEN: z.string().min(1).optional(),
    REPO_OWNER: z.string().min(1),
    REPO_NAME: z.string().min(1),
  },
  runtimeEnv: process.env,
});
