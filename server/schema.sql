-- Har Telegram foydalanuvchisining shahri (user_id — tekshirilgan initData dan)
CREATE TABLE IF NOT EXISTS saves (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
