CREATE TABLE `topic_history` (
	`owner` text NOT NULL,
	`topic_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`recorded_at` text NOT NULL,
	PRIMARY KEY(`owner`, `topic_id`, `revision`)
);

