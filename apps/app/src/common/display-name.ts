export interface DisplayUser {
  name?: string | null;
  email: string;
}

export function displayName(user: DisplayUser): string {
  return user.name?.trim() || user.email;
}
