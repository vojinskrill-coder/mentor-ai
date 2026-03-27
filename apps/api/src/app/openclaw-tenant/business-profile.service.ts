import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { CrawlResult } from './web-crawler.service';

export interface BusinessProfile {
  companyName: string;
  industry: string;
  description: string;
  products: string[];
  services: string[];
  targetClients: string[];
  geography: string;
  brandVoice: string;
  competitors: string[];
  uniqueValue: string;
  priceRange: string;
  teamDescription: string;
  visualStyle: string;
  keyMetrics: Record<string, string>;
  rawSummary: string;
}

@Injectable()
export class BusinessProfileService {
  private readonly logger = new Logger(BusinessProfileService.name);
  private readonly geminiApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.geminiApiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
  }

  /**
   * Analyze crawled website content and produce a structured BusinessProfile.
   * Uses Gemini 2.5 Flash for fast, cheap analysis.
   */
  async analyzeWebsite(crawlResult: CrawlResult, companyName: string): Promise<BusinessProfile> {
    this.logger.log({ message: 'Analyzing website for business profile', domain: crawlResult.domain, pages: crawlResult.pages.length });

    // Build context from crawled pages
    let context = '';
    for (const page of crawlResult.pages) {
      context += `\n\n=== ${page.type.toUpperCase()}: ${page.title} (${page.url}) ===\n${page.content}`;
    }

    // Truncate to ~40K chars to stay within Gemini input limits
    if (context.length > 40_000) {
      context = context.substring(0, 40_000);
    }

    const prompt = `You are a business analyst. Analyze the following website content for "${companyName}" and produce a structured JSON business profile.

WEBSITE CONTENT:
${context}

Return ONLY valid JSON with this exact structure (fill all fields based on what you find, use reasonable inferences where data is missing):
{
  "companyName": "${companyName}",
  "industry": "specific industry/niche",
  "description": "2-3 sentence business description",
  "products": ["product1", "product2"],
  "services": ["service1", "service2"],
  "targetClients": ["client segment 1", "client segment 2"],
  "geography": "markets served",
  "brandVoice": "describe the brand tone: professional/casual/luxury/technical etc",
  "competitors": ["competitor1", "competitor2"],
  "uniqueValue": "what makes this company unique",
  "priceRange": "price range if visible",
  "teamDescription": "team size and key people if visible",
  "visualStyle": "describe visual brand: colors, imagery style, mood",
  "keyMetrics": {"metric1": "value1"},
  "rawSummary": "500 word comprehensive summary of everything learned about this business - this will be used to train AI agents"
}`;

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
        },
        { timeout: 30_000 }
      );

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const usage = response.data?.usageMetadata;

      this.logger.log({
        message: 'Business profile generated',
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      });

      // Extract JSON from response (may be wrapped in ```json blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Gemini response');
      }

      return JSON.parse(jsonMatch[0]) as BusinessProfile;
    } catch (error) {
      this.logger.error({
        message: 'Business profile analysis failed',
        error: error instanceof Error ? error.message : 'Unknown',
      });

      // Return minimal profile on failure
      return {
        companyName,
        industry: 'Unknown',
        description: `${companyName} - business profile could not be fully analyzed.`,
        products: [],
        services: [],
        targetClients: [],
        geography: 'Unknown',
        brandVoice: 'Professional',
        competitors: [],
        uniqueValue: '',
        priceRange: '',
        teamDescription: '',
        visualStyle: 'Professional, clean',
        keyMetrics: {},
        rawSummary: `${companyName} website was crawled but detailed analysis failed. ${crawlResult.pages.length} pages found with ${crawlResult.totalChars} chars of content.`,
      };
    }
  }
}
