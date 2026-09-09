-- 社内音声配信アプリ 初期スキーマ
-- 日時はすべて ISO8601 (UTC) 文字列で保存する

CREATE TABLE IF NOT EXISTS members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',   -- 'member' | 'admin'
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL DEFAULT '#E8630A',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS episodes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  category_id        INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  audio_key          TEXT,                         -- R2 のオブジェクトキー。未アップロードなら NULL
  audio_content_type TEXT,
  audio_size         INTEGER,
  duration_sec       REAL,
  status             TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published'
  published_at       TEXT,
  created_by         INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episodes_status_published ON episodes(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_category ON episodes(category_id);

-- 誰がどこまで聴いたか（1人1エピソードにつき1行）
CREATE TABLE IF NOT EXISTS plays (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id       INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  member_id        INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position_sec     REAL NOT NULL DEFAULT 0,        -- 最後に止めた位置（続きから再生用）
  max_position_sec REAL NOT NULL DEFAULT 0,        -- 到達した最大位置（進捗率の根拠）
  completed        INTEGER NOT NULL DEFAULT 0,     -- 90% 以上聴いたら 1
  play_count       INTEGER NOT NULL DEFAULT 0,     -- 再生開始回数
  first_played_at  TEXT NOT NULL,
  last_played_at   TEXT NOT NULL,
  UNIQUE(episode_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_plays_member ON plays(member_id);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id  INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  deleted_at  TEXT                                  -- 論理削除
);
CREATE INDEX IF NOT EXISTS idx_comments_episode ON comments(episode_id, created_at);

-- 初期カテゴリー（管理画面で自由に変更できる）
INSERT OR IGNORE INTO categories (name, color, sort_order, created_at) VALUES
  ('全体朝礼',   '#E8630A', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('社長メッセージ', '#1C1C3A', 2, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('営業',       '#2F7D6D', 3, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('研修',       '#5B4B8A', 4, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('その他',     '#8A8078', 9, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
