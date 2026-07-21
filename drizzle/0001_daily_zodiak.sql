CREATE TABLE `sandbox_agents` (
	`sandbox_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sandbox_agents_sandbox_agent_idx` ON `sandbox_agents` (`sandbox_id`,`agent_id`);--> statement-breakpoint
CREATE INDEX `sandbox_agents_agent_idx` ON `sandbox_agents` (`owner_id`,`agent_id`);--> statement-breakpoint
CREATE TABLE `sandboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`infrastructure` text NOT NULL,
	`runtime` text NOT NULL,
	`max_execution_seconds` integer NOT NULL,
	`max_spend_cents` integer NOT NULL,
	`network_access` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sandboxes_owner_updated_idx` ON `sandboxes` (`owner_id`,`updated_at`);