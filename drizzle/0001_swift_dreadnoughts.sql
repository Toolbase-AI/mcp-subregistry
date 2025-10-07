ALTER TABLE `package_metadata` ADD `visibility` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
CREATE INDEX `pkg_meta_visibility_idx` ON `package_metadata` (`visibility`);--> statement-breakpoint
ALTER TABLE `servers` ADD `visibility` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
CREATE INDEX `visibility_idx` ON `servers` (`visibility`);