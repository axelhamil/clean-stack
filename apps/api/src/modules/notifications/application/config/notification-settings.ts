export interface NotificationSettings {
  digestHourUtc: number;
  databaseUrl: string;
}

export interface StaffAudienceSettings {
  PLATFORM_ADMIN_IDS: readonly string[];
  PLATFORM_ADMIN_REQUIRE_MFA: boolean;
}
