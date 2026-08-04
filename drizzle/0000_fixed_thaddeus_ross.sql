CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`period_month` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_couple_period_idx` ON `budgets` (`couple_id`,`period_month`);--> statement-breakpoint
CREATE TABLE `couple_members` (
	`couple_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`deleted_at` integer,
	PRIMARY KEY(`couple_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `couples` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`anniversary_on` text,
	`currency_code` text DEFAULT 'PHP' NOT NULL,
	`timezone` text DEFAULT 'Asia/Manila' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `dates` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`title` text,
	`occurred_on` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`location_label` text,
	`cover_photo_id` text,
	`rating` integer,
	`caption` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `dates_couple_occurred_idx` ON `dates` (`couple_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `dates_status_idx` ON `dates` (`couple_id`,`status`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`queued_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`date_id` text NOT NULL,
	`stop_id` text,
	`local_uri` text,
	`remote_key` text,
	`thumb_key` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`taken_at` integer,
	`upload_state` text DEFAULT 'local' NOT NULL,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `photos_date_idx` ON `photos` (`date_id`);--> statement-breakpoint
CREATE TABLE `stops` (
	`id` text PRIMARY KEY NOT NULL,
	`date_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`kind` text NOT NULL,
	`subkind` text,
	`label` text,
	`place_name` text,
	`lat` real,
	`lng` real,
	`occurred_at` integer,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`currency_code` text NOT NULL,
	`paid_by_user_id` text,
	`note` text,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `stops_date_idx` ON `stops` (`date_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `stops_kind_idx` ON `stops` (`kind`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`avatar_uri` text,
	`updated_at` integer NOT NULL,
	`server_updated_at` integer,
	`deleted_at` integer
);
