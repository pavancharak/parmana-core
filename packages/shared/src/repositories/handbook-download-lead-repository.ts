export interface HandbookDownloadLead {
  readonly handbookDownloadLeadId: string;
  readonly email: string;
  readonly capturedAt: Date;
}

/**
 * Repository for handbook download leads (docs/site/handbook/download.mdx).
 *
 * Deliberately write-mostly: an email address is captured before the
 * PDF link unlocks, no verification email is sent, so this is a
 * record of who asked, not a gate behind a confirmed inbox. See
 * migration 20260916150000_add_handbook_download_leads.sql's own
 * comment.
 */
export interface HandbookDownloadLeadRepository {
  create(lead: HandbookDownloadLead): Promise<HandbookDownloadLead>;
}
