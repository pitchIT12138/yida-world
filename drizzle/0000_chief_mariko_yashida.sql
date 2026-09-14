CREATE TABLE `discussions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`url` text NOT NULL,
	`fetched_at` text NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer NOT NULL,
	`body_key` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`fingerprint` text NOT NULL,
	`source_id` text NOT NULL,
	`source_hash` text NOT NULL,
	`body_key` text NOT NULL,
	`repairs` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`body_key` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer NOT NULL,
	`body_key` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`instruction` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`, `revision`)
);
