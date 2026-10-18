-- =============================================================================
-- Handbook download leads
--
-- Backs the email-gated PDF download at docs/site/handbook/download.mdx
-- (POST /handbook/download-leads). Deliberately simple: an email
-- address is required before the PDF link unlocks, but no
-- verification email is sent -- this table exists to record who
-- asked for the download, not to gate access behind a confirmed
-- inbox. If double opt-in verification is ever added, it belongs in
-- a separate migration, not folded into this one.
-- =============================================================================

CREATE TABLE IF NOT EXISTS handbook_download_leads (

    handbook_download_lead_id TEXT PRIMARY KEY,

    email TEXT NOT NULL,

    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX IF NOT EXISTS idx_handbook_download_leads_captured_at
ON handbook_download_leads (
    captured_at DESC
);

ALTER TABLE handbook_download_leads ENABLE ROW LEVEL SECURITY;
