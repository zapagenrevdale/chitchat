import { scenariosSchema } from "@chitchat/contracts";
import { queryOptions } from "@tanstack/react-query";

import { apiUrl } from "./env";

export const scenariosQuery = queryOptions({
  queryKey: ["scenarios"],
  queryFn: async ({ signal }) => {
    const response = await fetch(`${apiUrl}/api/scenarios`, { signal });
    if (!response.ok) {
      throw new Error(
        "Could not load practice scenarios. Check that the API is running."
      );
    }
    return scenariosSchema.parse(await response.json());
  },
  staleTime: 60_000,
});
