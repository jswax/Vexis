import type { ApifyTweetScraperInput } from '../twitter-ingestion/twitterIngestion.types.js';
import { TwitterIngestionService } from '../twitter-ingestion/twitterIngestion.service.js';

export class IngestionJobProcessor {
  constructor(private readonly ingestion = new TwitterIngestionService()) {}

  async run(input: ApifyTweetScraperInput, opts?: { sourceLabel?: string }) {
    return this.ingestion.ingest(input, { source: 'api', sourceLabel: opts?.sourceLabel });
  }
}

