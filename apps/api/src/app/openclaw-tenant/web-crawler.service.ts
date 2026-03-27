import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  type: 'homepage' | 'about' | 'services' | 'products' | 'team' | 'pricing' | 'contact' | 'blog' | 'other';
}

export interface CrawlResult {
  pages: CrawledPage[];
  totalChars: number;
  domain: string;
}

const MAX_PAGES = 20;
const MAX_CHARS_PER_PAGE = 5_000;
const FETCH_TIMEOUT_MS = 10_000;

/** URL patterns that indicate page type */
const PAGE_TYPE_PATTERNS: Array<{ pattern: RegExp; type: CrawledPage['type']; priority: number }> = [
  { pattern: /\/(about|o-nama|ko-smo|uber-uns)/i, type: 'about', priority: 1 },
  { pattern: /\/(services|usluge|dienstleistungen)/i, type: 'services', priority: 2 },
  { pattern: /\/(products|proizvodi|shop|store)/i, type: 'products', priority: 3 },
  { pattern: /\/(team|tim|ekipa|nas-tim)/i, type: 'team', priority: 4 },
  { pattern: /\/(pricing|cene|prices|paketi)/i, type: 'pricing', priority: 5 },
  { pattern: /\/(contact|kontakt)/i, type: 'contact', priority: 6 },
  { pattern: /\/(blog|news|vesti|novosti)/i, type: 'blog', priority: 7 },
  { pattern: /\/(portfolio|gallery|galerija|projekti|projects|works)/i, type: 'products', priority: 3 },
  { pattern: /\/(faq|pitanja)/i, type: 'other', priority: 8 },
];

@Injectable()
export class WebCrawlerService {
  private readonly logger = new Logger(WebCrawlerService.name);
  private readonly braveApiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.braveApiKey = this.configService.get<string>('BRAVE_API_KEY');
  }

  /**
   * Crawl a website: fetch homepage, discover internal links, fetch important pages.
   * Returns up to MAX_PAGES pages with extracted text content.
   */
  async crawlWebsite(websiteUrl: string): Promise<CrawlResult> {
    const baseUrl = this.normalizeUrl(websiteUrl);
    const domain = new URL(baseUrl).hostname;

    this.logger.log({ message: 'Starting website crawl', url: baseUrl, domain });

    // Step 1: Fetch homepage
    const homepage = await this.fetchPage(baseUrl);
    if (!homepage) {
      this.logger.warn({ message: 'Could not fetch homepage', url: baseUrl });
      return { pages: [], totalChars: 0, domain };
    }

    const pages: CrawledPage[] = [{
      url: baseUrl,
      title: homepage.title,
      content: homepage.content,
      type: 'homepage',
    }];

    // Step 2: Extract internal links from homepage HTML
    const internalLinks = await this.discoverLinks(baseUrl, homepage.html, domain);
    this.logger.log({ message: 'Discovered internal links', count: internalLinks.length });

    // Step 3: Prioritize and fetch important pages
    const prioritized = this.prioritizeLinks(internalLinks);
    const toFetch = prioritized.slice(0, MAX_PAGES - 1); // -1 for homepage

    const fetchResults = await Promise.allSettled(
      toFetch.map(link => this.fetchPage(link.url))
    );

    for (let i = 0; i < fetchResults.length; i++) {
      const result = fetchResults[i]!;
      if (result.status === 'fulfilled' && result.value) {
        pages.push({
          url: toFetch[i]!.url,
          title: result.value.title,
          content: result.value.content,
          type: toFetch[i]!.type,
        });
      }
    }

    const totalChars = pages.reduce((sum, p) => sum + p.content.length, 0);

    this.logger.log({
      message: 'Website crawl complete',
      domain,
      pagesFound: pages.length,
      totalChars,
    });

    return { pages, totalChars, domain };
  }

  /** Fetch a page and extract title + text content */
  private async fetchPage(url: string): Promise<{ title: string; content: string; html: string } | null> {
    try {
      const response = await axios.get(url, {
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MentorAI/1.0; +https://mentor-ai.com)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        maxRedirects: 5,
        responseType: 'text',
      });

      const html = response.data as string;
      const title = this.extractTitle(html);
      const content = this.extractTextFromHtml(html).substring(0, MAX_CHARS_PER_PAGE);

      return { title, content, html };
    } catch (error) {
      this.logger.warn({
        message: 'Page fetch failed',
        url,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /** Extract all internal links from HTML */
  private async discoverLinks(
    baseUrl: string,
    html: string,
    domain: string,
  ): Promise<Array<{ url: string; type: CrawledPage['type']; priority: number }>> {
    const seen = new Set<string>([baseUrl]);
    const links: Array<{ url: string; type: CrawledPage['type']; priority: number }> = [];

    // Extract href from anchor tags
    const hrefRegex = /href=["']([^"'#]+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(html)) !== null) {
      try {
        const href = match[1]!;
        const absoluteUrl = new URL(href, baseUrl).href;
        const urlObj = new URL(absoluteUrl);

        // Only internal links
        if (urlObj.hostname !== domain) continue;
        // Skip assets, anchors, query strings
        if (/\.(jpg|jpeg|png|gif|svg|css|js|pdf|zip|mp4|mp3|woff|ico)/i.test(urlObj.pathname)) continue;

        const normalized = urlObj.origin + urlObj.pathname.replace(/\/$/, '');
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        const type = this.classifyUrl(normalized);
        const priority = PAGE_TYPE_PATTERNS.find(p => p.type === type.type)?.priority ?? 9;
        links.push({ url: normalized, ...type, priority });
      } catch {
        // Invalid URL, skip
      }
    }

    return links.sort((a, b) => a.priority - b.priority);
  }

  /** Classify URL by its path pattern */
  private classifyUrl(url: string): { type: CrawledPage['type'] } {
    for (const { pattern, type } of PAGE_TYPE_PATTERNS) {
      if (pattern.test(url)) return { type };
    }
    return { type: 'other' };
  }

  /** Prioritize links: about > services > products > team > pricing > blog > other */
  private prioritizeLinks(links: Array<{ url: string; type: CrawledPage['type']; priority: number }>) {
    // Deduplicate by type - keep max 3 per type
    const byType = new Map<string, typeof links>();
    for (const link of links) {
      const existing = byType.get(link.type) ?? [];
      if (existing.length < 3) {
        existing.push(link);
        byType.set(link.type, existing);
      }
    }
    return Array.from(byType.values()).flat().sort((a, b) => a.priority - b.priority);
  }

  private normalizeUrl(url: string): string {
    if (!url.startsWith('http')) url = 'https://' + url;
    return url.replace(/\/$/, '');
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match?.[1]?.trim() ?? '';
  }

  private extractTextFromHtml(html: string): string {
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }
}
