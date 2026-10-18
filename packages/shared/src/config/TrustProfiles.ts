export const TrustProfiles = {
  V1: "v1",
} as const;

export type TrustProfile = (typeof TrustProfiles)[keyof typeof TrustProfiles];
