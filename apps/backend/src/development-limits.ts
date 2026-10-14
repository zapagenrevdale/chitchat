export interface DevelopmentLimits {
  environment: string;
  bypass: boolean;
}

export function bypassDevelopmentLimits(options?: DevelopmentLimits) {
  return options?.environment === "development" && options.bypass;
}
