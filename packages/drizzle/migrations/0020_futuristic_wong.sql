CREATE TABLE "sweep_lock" (
	"label" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone NOT NULL
);
