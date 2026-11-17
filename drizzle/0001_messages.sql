CREATE TABLE message_members (
  user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE direct_messages (
  id TEXT PRIMARY KEY NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment_name TEXT,
  attachment_data TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX direct_messages_sender ON direct_messages (sender_id, created_at);
--> statement-breakpoint
CREATE INDEX direct_messages_recipient ON direct_messages (recipient_id, created_at);
