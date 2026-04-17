import { SourceVaultService } from './source-vault.service';
import { ConfigService } from '@nestjs/config';

describe('SourceVaultService', () => {
  let service: SourceVaultService;

  beforeEach(() => {
    service = new SourceVaultService(new ConfigService());
  });

  describe('extractWikilinks', () => {
    it('should extract simple wikilinks', () => {
      const content = 'This references [[Marketing]] and [[Prodaja]] concepts.';
      const links = service.extractWikilinks(content);
      expect(links).toEqual(['Marketing', 'Prodaja']);
    });

    it('should handle wikilinks with display text (pipes)', () => {
      const content = 'See [[Marketing|marketing strategy]] for details.';
      const links = service.extractWikilinks(content);
      expect(links).toEqual(['Marketing']);
    });

    it('should handle wikilinks with section anchors', () => {
      const content = 'See [[Marketing#Overview]] and [[Prodaja#Strategy]].';
      const links = service.extractWikilinks(content);
      expect(links).toEqual(['Marketing', 'Prodaja']);
    });

    it('should deduplicate links', () => {
      const content = '[[Marketing]] is important. See [[Marketing]] again.';
      const links = service.extractWikilinks(content);
      expect(links).toEqual(['Marketing']);
    });

    it('should return empty array for content without links', () => {
      const content = 'No wikilinks here, just plain text.';
      const links = service.extractWikilinks(content);
      expect(links).toEqual([]);
    });

    it('should return empty array for empty content', () => {
      expect(service.extractWikilinks('')).toEqual([]);
    });

    it('should handle multiple links on one line', () => {
      const content = '[[A]] relates to [[B]] and [[C]].';
      const links = service.extractWikilinks(content);
      expect(links).toEqual(['A', 'B', 'C']);
    });

    it('should handle pipe + anchor combo', () => {
      const content = '[[Marketing#Overview|marketing overview]] details.';
      const links = service.extractWikilinks(content);
      expect(links).toEqual(['Marketing']);
    });
  });
});
