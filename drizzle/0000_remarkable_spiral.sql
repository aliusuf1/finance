CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`receiver_name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'PKR' NOT NULL,
	`occurred_at` text,
	`transaction_id` text,
	`channel` text,
	`account_masked` text,
	`purpose_note` text DEFAULT '' NOT NULL,
	`source_name` text,
	`raw_text` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipts_user_created_idx` ON `receipts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
