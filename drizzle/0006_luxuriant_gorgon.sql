CREATE TABLE `model_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`bucket` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_rate_limits_owner_window_idx` ON `model_rate_limits` (`owner_id`,`window_start`);