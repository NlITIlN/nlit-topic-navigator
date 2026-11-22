CREATE TABLE `topic_enrichments` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`topic_id` text NOT NULL,
	`request_digest` text NOT NULL,
	`preview_digest` text NOT NULL,
	`payload` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
