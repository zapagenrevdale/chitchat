import { z } from "zod";

export * from "./practice";
export * from "./preset-places";

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("chitchat-api"),
});

export const scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
});

export const scenariosSchema = z.array(scenarioSchema);
export type Scenario = z.infer<typeof scenarioSchema>;
