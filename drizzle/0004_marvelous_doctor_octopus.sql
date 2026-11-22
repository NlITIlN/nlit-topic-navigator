CREATE TABLE `topic_merges` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`digest` text NOT NULL,
	`payload` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`undone_at` text,
	PRIMARY KEY(`owner`, `id`)
);
