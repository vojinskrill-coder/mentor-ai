import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WebSearchService } from './web-search.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebSearchService', () => {
  let service: WebSearchService;
  let mockConfig: { get: jest.Mock };

  beforeEach(async () => {
    mockConfig = {
      get: jest.fn().mockReturnValue('test-api-key'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSearchService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<WebSearchService>(WebSearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('should return true when API key is configured', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when API key is not configured', async () => {
      mockConfig.get.mockReturnValue(undefined);
      const module = await Test.createTestingModule({
        providers: [
          WebSearchService,
          { provide: ConfigService, useValue: mockConfig },
        ],
      }).compile();
      const svc = module.get<WebSearchService>(WebSearchService);
      expect(svc.isAvailable()).toBe(false);
    });
  });

  describe('search', () => {
    it('should return search results from Serper API', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          organic: [
            { title: 'Result 1', link: 'https://example.com/1', snippet: 'Snippet 1' },
            { title: 'Result 2', link: 'https://example.com/2', snippet: 'Snippet 2' },
          ],
        },
      });

      const results = await service.search('test query', 5);

      expect(results).toHaveLength(2);
      expect(results[0]!.title).toBe('Result 1');
      expect(results[0]!.link).toBe('https://example.com/1');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        { q: 'test query', num: 5 },
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-API-KEY': 'test-api-key' }),
          timeout: 8000,
        }),
      );
    });

    it('should return empty array when API key is missing', async () => {
      mockConfig.get.mockReturnValue(undefined);
      const module = await Test.createTestingModule({
        providers: [
          WebSearchService,
          { provide: ConfigService, useValue: mockConfig },
        ],
      }).compile();
      const svc = module.get<WebSearchService>(WebSearchService);

      const results = await svc.search('test query');
      expect(results).toHaveLength(0);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should return empty array when API call fails', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const results = await service.search('test query');
      expect(results).toHaveLength(0);
    });
  });

  describe('fetchWebpage', () => {
    it('should fetch and extract text from HTML', async () => {
      mockedAxios.get.mockResolvedValue({
        data: '<html><body><p>Hello World</p></body></html>',
      });

      const text = await service.fetchWebpage('https://example.com');
      expect(text).toContain('Hello World');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ timeout: 10000 }),
      );
    });

    it('should strip script, style, nav, footer, header tags', async () => {
      mockedAxios.get.mockResolvedValue({
        data: '<html><script>alert("x")</script><style>.x{}</style><nav>Nav</nav><body><p>Content</p></body><footer>Foot</footer></html>',
      });

      const text = await service.fetchWebpage('https://example.com');
      expect(text).toContain('Content');
      expect(text).not.toContain('alert');
      expect(text).not.toContain('.x{}');
      expect(text).not.toContain('Nav');
      expect(text).not.toContain('Foot');
    });

    it('should return empty string when fetch fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Timeout'));

      const text = await service.fetchWebpage('https://example.com');
      expect(text).toBe('');
    });

    it('should truncate content to 5000 chars', async () => {
      const longContent = '<html><body>' + 'A'.repeat(10000) + '</body></html>';
      mockedAxios.get.mockResolvedValue({ data: longContent });

      const text = await service.fetchWebpage('https://example.com');
      expect(text.length).toBeLessThanOrEqual(5000);
    });
  });

  describe('searchAndExtract', () => {
    const mockSearchResults = [
      { title: 'R1', link: 'https://example.com/1', snippet: 'Snippet 1' },
      { title: 'R2', link: 'https://example.com/2', snippet: 'Snippet 2' },
      { title: 'R3', link: 'https://example.com/3', snippet: 'Snippet 3' },
    ];

    beforeEach(() => {
      mockedAxios.post.mockResolvedValue({
        data: { organic: mockSearchResults },
      });
    });

    it('should combine search results with page content', async () => {
      mockedAxios.get.mockResolvedValue({
        data: '<html><body><p>Page content here</p></body></html>',
      });

      const results = await service.searchAndExtract('test query', 3);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.title).toBe('R1');
      expect(results[0]!.link).toBe('https://example.com/1');
      expect(results[0]!.pageContent).toBeDefined();
      expect(results[0]!.fetchedAt).toBeDefined();
    });

    it('should return empty array when search returns nothing', async () => {
      mockedAxios.post.mockResolvedValue({ data: { organic: [] } });

      const results = await service.searchAndExtract('test query');
      expect(results).toHaveLength(0);
    });

    it('should handle page fetch failures gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Fetch failed'));

      const results = await service.searchAndExtract('test query', 3);

      // Results should still be returned (with snippets, no pageContent)
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.pageContent).toBeUndefined();
      expect(results[0]!.snippet).toBe('Snippet 1');
    });

    it('should truncate page content to 3000 chars per page', async () => {
      const longHtml = '<html><body>' + 'B'.repeat(8000) + '</body></html>';
      mockedAxios.get.mockResolvedValue({ data: longHtml });

      const results = await service.searchAndExtract('test query', 3);

      for (const result of results) {
        if (result.pageContent) {
          expect(result.pageContent.length).toBeLessThanOrEqual(3000);
        }
      }
    });

    it('should enforce total context limit of 10000 chars', async () => {
      // Each page returns ~4000 chars of extracted text
      const longHtml = '<html><body>' + 'C'.repeat(6000) + '</body></html>';
      mockedAxios.get.mockResolvedValue({ data: longHtml });

      const results = await service.searchAndExtract('test query', 5);

      let totalChars = 0;
      for (const r of results) {
        totalChars += r.pageContent?.length ?? r.snippet.length;
      }
      expect(totalChars).toBeLessThanOrEqual(10000);
    });

    it('should only deep-fetch top 3 results', async () => {
      const fiveResults = [
        ...mockSearchResults,
        { title: 'R4', link: 'https://example.com/4', snippet: 'Snippet 4' },
        { title: 'R5', link: 'https://example.com/5', snippet: 'Snippet 5' },
      ];
      mockedAxios.post.mockResolvedValue({ data: { organic: fiveResults } });
      mockedAxios.get.mockResolvedValue({ data: '<html><body>Content</body></html>' });

      await service.searchAndExtract('test query', 5);

      // axios.get called 3 times (top 3 only), not 5
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    });

    it('should include fetchedAt timestamp on all results', async () => {
      mockedAxios.get.mockResolvedValue({ data: '<html><body>Content</body></html>' });

      const results = await service.searchAndExtract('test query', 3);

      for (const r of results) {
        expect(r.fetchedAt).toBeDefined();
        expect(new Date(r.fetchedAt).getTime()).not.toBeNaN();
      }
    });
  });
});
