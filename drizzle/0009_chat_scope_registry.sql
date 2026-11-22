CREATE TABLE `chat_scopes` (
	`owner` text NOT NULL,
	`fingerprint` text NOT NULL,
	PRIMARY KEY(`owner`, `fingerprint`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_scopes_fingerprint_unique` ON `chat_scopes` (`fingerprint`);