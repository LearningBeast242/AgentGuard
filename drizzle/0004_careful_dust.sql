CREATE TABLE `security_replays` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`regression_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`expected_decision` text NOT NULL,
	`actual_decision` text NOT NULL,
	`passed` integer NOT NULL,
	`executed` integer NOT NULL,
	`summary` text NOT NULL,
	`findings_json` text NOT NULL,
	`trace_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_replays_owner_created_idx` ON `security_replays` (`owner_id`,`created_at`);