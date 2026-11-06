import type { AppError, Option, Result } from "@packages/ddd-kit";

export type UserAccountError = AppError<"USER_ACCOUNT_PROVIDER_FAILURE">;

export type UserContact = {
  email: string;
  name: Option<string>;
  locale: Option<string>;
};

export interface IUserAccountStore {
  findContact(userId: string): Promise<Result<Option<UserContact>, UserAccountError>>;
  setName(userId: string, name: string): Promise<Result<void, UserAccountError>>;
}
