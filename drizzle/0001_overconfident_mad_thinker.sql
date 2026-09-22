CREATE TABLE `cardScans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cardId` int,
	`frontImageUrl` text,
	`backImageUrl` text,
	`recognitionStatus` enum('pending','matched','review') NOT NULL DEFAULT 'matched',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cardScans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`subtitle` varchar(160),
	`kind` enum('legend','unit','gear','program') NOT NULL,
	`color` varchar(32) NOT NULL,
	`cost` int,
	`power` int,
	`ram` int NOT NULL DEFAULT 0,
	`rarity` varchar(64) NOT NULL,
	`setName` varchar(160) NOT NULL,
	`sourceUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collectionItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cardId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`condition` varchar(32) NOT NULL DEFAULT 'NM',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collectionItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deckCards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deckId` int NOT NULL,
	`cardId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`slot` enum('legend','main') NOT NULL,
	CONSTRAINT `deckCards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `decks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `decks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `priceSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`source` varchar(80) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`marketCents` int NOT NULL,
	`lowCents` int,
	`highCents` int,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `priceSnapshots_id` PRIMARY KEY(`id`)
);
