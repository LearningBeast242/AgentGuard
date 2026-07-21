CREATE TABLE `security_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`scenario` text NOT NULL,
	`title` text NOT NULL,
	`task` text NOT NULL,
	`repository_json` text NOT NULL,
	`operation_json` text NOT NULL,
	`decision` text NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`findings_json` text NOT NULL,
	`trace_json` text NOT NULL,
	`executed` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_incidents_owner_created_idx` ON `security_incidents` (`owner_id`,`created_at`);