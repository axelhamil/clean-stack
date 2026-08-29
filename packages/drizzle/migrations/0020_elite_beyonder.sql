CREATE TABLE "sweep_lock" (
	"label" text PRIMARY KEY NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp NOT NULL
);
