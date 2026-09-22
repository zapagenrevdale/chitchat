import { createAuthClient } from "better-auth/react";

import { apiUrl } from "./env";

export const authClient = createAuthClient({ baseURL: apiUrl });
