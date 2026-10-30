export const REDIRECT_ADMIN_ORIGIN = "https://admin.example.com";

export interface RedirectVector {
  readonly target: string;
  readonly expected?: string;
}

/** One table for both allowlists, the sign-in pages' and the API's e-mail links: they must agree. */
export const REDIRECT_VECTORS: readonly RedirectVector[] = [
  { target: "/dashboard", expected: "/dashboard" },
  { target: "/pricing?plan=pro#top", expected: "/pricing?plan=pro#top" },
  { target: "https://admin.example.com/users", expected: "https://admin.example.com/users" },
  {
    target: "https://admin.example.com/users?x=1#y",
    expected: "https://admin.example.com/users?x=1#y",
  },
  { target: "https://admin.example.com", expected: "https://admin.example.com/" },
  { target: "https://admin.exa\tmple.com/users" },
  { target: "https:/admin.example.com/" },
  { target: "https://evil.example/users" },
  { target: "//evil.example" },
  { target: "/\\evil.example" },
  { target: "\\\\evil.example" },
  { target: "/\t/evil.example" },
  { target: "/a/..//evil.example" },
  { target: "/%2f/evil.example" },
  { target: "/%5Cevil.example" },
  { target: "javascript:alert(1)" },
  { target: "data:text/html,x" },
  { target: "evil.example" },
  { target: "http://admin.example.com/users" },
  { target: "https://admin.example.com.evil.example/users" },
  { target: "https://admin.example.community/users" },
  { target: "https://admin.example.com:8443/users" },
  { target: "https://admin.example.com@evil.example/users" },
  { target: "https://user:pass@admin.example.com/users" },
  { target: "https://admin.example.com//evil.example" },
  { target: "https://admin.example.com/%2fevil.example" },
  { target: "https://admin.example.com/%5Cevil.example" },
];
