CREATE TABLE `activityEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('scan','deck','recommendation','collection') NOT NULL,
	`title` varchar(200) NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deckShares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deckId` int NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deckShares_id` PRIMARY KEY(`id`),
	CONSTRAINT `deckShares_token_unique` UNIQUE(`token`)
);
