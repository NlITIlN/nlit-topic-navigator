CREATE TABLE `topic_activity` (
	`owner` text NOT NULL,
	`topic_id` text NOT NULL,
	`selected_at` text NOT NULL,
	PRIMARY KEY(`owner`, `topic_id`)
);
--> statement-breakpoint
ALTER TABLE `topics` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `group_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `sources` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `pinned` integer DEFAULT 0 NOT NULL;