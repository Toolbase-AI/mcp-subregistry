CREATE TABLE `package_metadata` (
	`name` text PRIMARY KEY NOT NULL,
	`registry_meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pkg_meta_name_idx` ON `package_metadata` (`name`);--> statement-breakpoint
CREATE TABLE `servers` (
	`name` text NOT NULL,
	`version` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_latest` integer DEFAULT false NOT NULL,
	`repository` text,
	`website_url` text,
	`packages` text,
	`remotes` text,
	`publisher_meta` text DEFAULT '{}' NOT NULL,
	`parent_registry_meta` text DEFAULT '{}' NOT NULL,
	`version_registry_meta` text DEFAULT '{}' NOT NULL,
	`published_at` integer NOT NULL,
	`source` text DEFAULT 'official-registry' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`name`, `version`)
);
--> statement-breakpoint
CREATE INDEX `status_idx` ON `servers` (`status`);--> statement-breakpoint
CREATE INDEX `source_idx` ON `servers` (`source`);--> statement-breakpoint
CREATE INDEX `latest_idx` ON `servers` (`name`,`is_latest`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `servers` (`name`);--> statement-breakpoint
CREATE INDEX `published_idx` ON `servers` (`name`,`published_at`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`servers_added` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`synced_at` integer NOT NULL
);
