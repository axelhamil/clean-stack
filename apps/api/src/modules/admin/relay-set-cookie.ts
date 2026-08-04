export function relaySetCookie(from: Response, to: Response): Response {
  for (const cookie of from.headers.getSetCookie()) {
    to.headers.append("set-cookie", cookie);
  }
  return to;
}
