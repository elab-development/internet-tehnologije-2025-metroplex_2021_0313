export const ROLES = {
  USER: "USER",
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
