CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"points" integer NOT NULL,
	"expire" timestamp
);
