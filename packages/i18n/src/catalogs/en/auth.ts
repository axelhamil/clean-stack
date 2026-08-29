export default {
  signIn: {
    submit: "Sign in",
    pending: "Signing in…",
    success: "Welcome back",
    failed: "Sign-in failed",
  },
  signUp: {
    submit: "Create account",
    pending: "Creating account…",
    passwordHint: "At least 15 characters. Avoid passwords exposed in known data breaches.",
    acceptPrefix: "I accept the",
    acceptSeparator: "and",
    privacyPolicy: "Privacy Policy",
    termsOfService: "Terms of Service",
  },
  twoFactor: {
    invalidCode: "Invalid code",
    invalidBackupCode: "Invalid backup code",
  },
  resetPassword: {
    failed: "Reset failed",
  },
  passkey: {
    failed: "Passkey sign-in failed",
  },
} as const;
