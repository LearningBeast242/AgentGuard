CREATE TABLE `agent_run_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_run_steps_run_index_idx` ON `agent_run_steps` (`run_id`,`step_index`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`task` text NOT NULL,
	`status` text NOT NULL,
	`provider` text,
	`model` text,
	`delivery_mode` text NOT NULL,
	`final_output` text,
	`pending_action_json` text,
	`pending_evaluation_json` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_runs_owner_created_idx` ON `agent_runs` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`purpose` text NOT NULL,
	`instructions` text NOT NULL,
	`risk_level` text NOT NULL,
	`tools_json` text NOT NULL,
	`policies_json` text NOT NULL,
	`tests_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agents_owner_updated_idx` ON `agents` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`tool` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`decision` text NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`findings_json` text NOT NULL,
	`provider` text,
	`provider_message_id` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `audit_events_actor_created_idx` ON `audit_events` (`actor_id`,`created_at`);