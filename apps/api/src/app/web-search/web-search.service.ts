import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { EnrichedSearchResult } from '@mentor-ai/shared/types';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

const SEARCH_TIMEOUT_MS = 8_000;
const PAGE_FETCH_TIMEOUT_MS = 10_000;
const TOTAL_WEB_RESEARCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_CONTENT_CHARS = 3_000;
const MAX_TOTAL_WEB_CONTEXT_CHARS = 10_000;

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SERPER_API_KEY');
  }

  /**
   * Whether web search is available (API key configured).
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Searches the web using Serper.dev Google Search API.
   * Returns top results with title, link, and snippet.
   */
  async search(query: string, numResults = 5): Promise<SearchResult[]> {
    if (!this.apiKey) {
      this.logger.warn('SERPER_API_KEY not configured — web search unavailable');
      return [];
    }

    try {
      const response = await axios.post(
        'https://google.serper.dev/search',
        { q: query, num: numResults },
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: SEARCH_TIMEOUT_MS,
        },
      );

      const organic = response.data?.organic ?? [];
      const results: SearchResult[] = organic.slice(0, numResults).map(
        (item: { title?: string; link?: string; snippet?: string }) => ({
          title: item.title ?? '',
          link: item.link ?? '',
          snippet: item.snippet ?? '',
        }),
      );

      this.logger.log({
        message: 'Web search completed',
        query,
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      this.logger.warn({
        message: 'Web search failed',
        query,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return [];
    }
  }

  /**
   * Fetches a webpage and extracts text content.
   * Returns cleaned text content (max 5000 chars).
   */
  async fetchWebpage(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: PAGE_FETCH_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MentorAI/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        maxRedirects: 5,
        responseType: 'text',
      });

      const html = response.data as string;
      // Basic HTML to text extraction
      const text = this.extractTextFromHtml(html);

      this.logger.log({
        message: 'Webpage fetched',
        url,
        textLength: text.length,
      });

      return text.substring(0, 5000);
    } catch (error) {
      this.logger.warn({
        message: 'Webpage fetch failed',
        url,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return '';
    }
  }

  /**
   * Combined search + deep page extraction with global timeout.
   * Returns enriched results with optional page content.
   */
  async searchAndExtract(query: string, numResults = 5): Promise<EnrichedSearchResult[]> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const globalTimeout = new Promise<EnrichedSearchResult[]>((resolve) => {
      timeoutId = setTimeout(() => {
        this.logger.warn({ message: 'Web research global timeout reached', query });
        resolve([]);
      }, TOTAL_WEB_RESEARCH_TIMEOUT_MS);
    });

    const work = async (): Promise<EnrichedSearchResult[]> => {
      try {
        // Phase 1: Search
        const searchResults = await this.search(query, numResults);
        if (searchResults.length === 0) return [];

        const now = new Date().toISOString();

        // Phase 2: Deep fetch top 3 results in parallel
        const topResults = searchResults.slice(0, 3);
        const fetchResults = await Promise.allSettled(
          topResults.map((r) => this.fetchWebpage(r.link)),
        );

        // Build enriched results with page content
        const enriched: EnrichedSearchResult[] = [];
        let totalContentChars = 0;

        for (let i = 0; i < searchResults.length; i++) {
          const result = searchResults[i]!;
          let pageContent: string | undefined;

          // Only top 3 have deep fetch attempts
          if (i < fetchResults.length) {
            const fetchResult = fetchResults[i]!;
            if (fetchResult.status === 'fulfilled' && fetchResult.value) {
              const truncated = fetchResult.value.substring(0, MAX_PAGE_CONTENT_CHARS);
              if (totalContentChars + truncated.length <= MAX_TOTAL_WEB_CONTEXT_CHARS) {
                pageContent = truncated;
                totalContentChars += truncated.length;
              }
            }
          }

          // Also count snippet towards total
          const snippetLen = result.snippet.length;
          if (!pageContent && totalContentChars + snippetLen > MAX_TOTAL_WEB_CONTEXT_CHARS) {
            continue; // Skip to stay within budget
          }
          if (!pageContent) totalContentChars += snippetLen;

          enriched.push({
            title: result.title,
            link: result.link,
            snippet: result.snippet,
            pageContent,
            fetchedAt: now,
          });
        }

        this.logger.log({
          message: 'Search and extract completed',
          query,
          resultCount: enriched.length,
          deepFetchCount: fetchResults.filter((r) => r.status === 'fulfilled' && r.value).length,
          totalContentChars,
        });

        return enriched;
      } finally {
        clearTimeout(timeoutId!);
      }
    };

    return Promise.race([work(), globalTimeout]);
  }

  /**
   * Formats enriched search results into an Obsidian-style context block
   * with markdown links [Title](URL) for AI system prompt injection.
   */
  formatSourcesAsObsidian(results: EnrichedSearchResult[]): string {
    if (!results || results.length === 0) return '';

    let context = '\n\n--- WEB ISTRAŽIVANJE (aktuelni podaci) ---';
    for (const result of results) {
      context += `\n\n**[${result.title}](${result.link})**`;
      if (result.pageContent) {
        context += `\n${result.pageContent}`;
      } else {
        context += `\n${result.snippet}`;
      }
    }
    context += '\n--- KRAJ WEB ISTRAŽIVANJA ---';
    context += '\n\nKada koristiš informacije iz web istraživanja, citiraj izvor koristeći Obsidian format linkova.';
    context += '\nNa kraju odgovora dodaj sekciju:\n\n### Izvori / Sources\n- [Naziv izvora](URL)';
    return context;
  }

  /**
   * Basic HTML to text extraction without external dependencies.
   */
  private extractTextFromHtml(html: string): string {
    // Remove script and style tags with their content
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }
}
