CREATE TABLE `topics` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`decisions` text DEFAULT '' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
