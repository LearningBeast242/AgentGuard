CREATE TABLE `security_regressions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`name` text NOT NULL,
	`scenario_json` text NOT NULL,
	`expected_decision` text NOT NULL,
	`policy_version` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_regressions_owner_incident_idx` ON `security_regressions` (`owner_id`,`incident_id`);--> statement-breakpoint
CREATE INDEX `security_regressions_owner_created_idx` ON `security_regressions` (`owner_id`,`created_at`);