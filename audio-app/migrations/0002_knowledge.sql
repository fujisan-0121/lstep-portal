-- ナレッジ連携: 文字起こし・要約・Notion 議事録DBへの登録
ALTER TABLE episodes ADD COLUMN transcript TEXT;
ALTER TABLE episodes ADD COLUMN summary TEXT;
ALTER TABLE episodes ADD COLUMN notion_page_id TEXT;
ALTER TABLE episodes ADD COLUMN notion_page_url TEXT;
-- 'none' | 'pending' | 'processing' | 'done' | 'error'
ALTER TABLE episodes ADD COLUMN knowledge_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE episodes ADD COLUMN knowledge_error TEXT;
ALTER TABLE episodes ADD COLUMN knowledge_updated_at TEXT;

-- 公開済みで未処理のものは対象にする
UPDATE episodes SET knowledge_status = 'pending' WHERE status = 'published' AND audio_key IS NOT NULL;
