import type { Pool } from "pg";

import type {
  HandbookDownloadLead,
  HandbookDownloadLeadRepository,
} from "@parmana/shared";

/**
 * Postgres-backed implementation of HandbookDownloadLeadRepository.
 * Write-only from the API's perspective -- see the migration's own
 * comment for why no verification/read path exists here.
 */
export class SupabaseHandbookDownloadLeadRepository implements HandbookDownloadLeadRepository {
  constructor(private readonly pool: Pool) {}

  async create(lead: HandbookDownloadLead): Promise<HandbookDownloadLead> {
    await this.pool.query(INSERT_LEAD_SQL, [
      lead.handbookDownloadLeadId,
      lead.email,
      lead.capturedAt.toISOString(),
    ]);

    return lead;
  }
}

const INSERT_LEAD_SQL = `
  INSERT INTO handbook_download_leads (handbook_download_lead_id, email, captured_at)
  VALUES ($1, $2, $3)
`;
