const QUERY_BUILDER_ONLY_DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = QUERY_BUILDER_ONLY_DATABASE_URL;
}
