import type { AppError, Option, Result } from "@packages/ddd-kit";

export type UserContactError = AppError<"USER_ACCOUNT_PROVIDER_FAILURE">;

export type UserContact = {
  email: string;
  name: Option<string>;
  locale: Option<string>;
};

export interface IUserContactReader {
  findContact(userId: string): Promise<Result<Option<UserContact>, UserContactError>>;
}
