import { prismaAdapter } from "@better-auth/prisma-adapter";
import { createDatabase } from "@chitchat/db";
import { betterAuth } from "better-auth";

import { env } from "./env";

export const db = createDatabase(env.DATABASE_URL);

export const auth = betterAuth({
  appName: "Chitchat",
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [env.WEB_ORIGIN],
  emailAndPassword: { enabled: true },
});
