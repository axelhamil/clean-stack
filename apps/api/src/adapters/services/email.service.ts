type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailInput): Promise<void> {
  console.log(
    `\x1b[36m✉\x1b[0m email · to=${to} · subject="${subject}"\n${html}`,
  );
  await Promise.resolve();
}
