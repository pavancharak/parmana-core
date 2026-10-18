import type {
  HandbookDownloadLead,
  HandbookDownloadLeadRepository,
} from "@parmana/shared";

/**
 * In-memory HandbookDownloadLeadRepository, for local dev and tests.
 */
export class MemoryHandbookDownloadLeadRepository implements HandbookDownloadLeadRepository {
  private readonly leads: HandbookDownloadLead[] = [];

  async create(lead: HandbookDownloadLead): Promise<HandbookDownloadLead> {
    this.leads.push(lead);

    return lead;
  }
}
