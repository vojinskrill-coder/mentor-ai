import { Injectable } from '@nestjs/common';

/**
 * SectionFilterService — filters markdown concept content by department.
 *
 * Each H2 section in a concept can have a department tag comment:
 *   ## Section Title
 *   <!-- dept:Marketing,Sales -->
 *
 * This service parses the markdown, identifies section boundaries,
 * checks the department tags, and returns only sections the user's
 * role is allowed to see.
 *
 * - PLATFORM_OWNER / TENANT_OWNER see ALL sections
 * - Department users see sections tagged with their department + "all"
 * - Sections without tags are treated as "all" (visible to everyone)
 */

interface FilteredSection {
  heading: string;
  content: string;
  departments: string[];
}

@Injectable()
export class SectionFilterService {
  /**
   * Filter markdown content by user's department.
   * Returns the filtered markdown with only the sections the user can see.
   *
   * @param markdown Full concept markdown (with frontmatter)
   * @param userDepartment User's department (null = owner, sees all)
   * @param userRole User's role (PLATFORM_OWNER/TENANT_OWNER bypass filter)
   */
  filterByDepartment(
    markdown: string,
    userDepartment: string | null,
    userRole: string,
  ): string {
    // Owners see everything
    if (!userDepartment || userRole === 'PLATFORM_OWNER' || userRole === 'TENANT_OWNER') {
      return markdown;
    }

    // Split into frontmatter + body
    const { frontmatter, body } = this.splitFrontmatter(markdown);

    // Parse sections from body
    const sections = this.parseSections(body);

    // Filter sections by department
    const filtered = sections.filter((section) => {
      if (section.departments.length === 0) return true; // No tags = visible to all
      if (section.departments.includes('all')) return true;
      return section.departments.some(
        (d) => d.toLowerCase() === userDepartment.toLowerCase(),
      );
    });

    // Reconstruct markdown
    const filteredBody = filtered
      .map((s) => {
        // Strip the dept comment from output (user doesn't see tags)
        const cleanContent = s.content.replace(/<!--\s*dept:[^>]+-->\n?/g, '');
        return `${s.heading}\n${cleanContent}`;
      })
      .join('\n');

    return frontmatter ? `${frontmatter}\n${filteredBody}` : filteredBody;
  }

  /**
   * Extract section tags from markdown without filtering.
   * Returns a map of section name → department tags.
   */
  extractSectionTags(markdown: string): Record<string, string[]> {
    const { body } = this.splitFrontmatter(markdown);
    const sections = this.parseSections(body);

    const tags: Record<string, string[]> = {};
    for (const section of sections) {
      const key = section.heading
        .replace(/^##\s+/, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
      tags[key] = section.departments;
    }
    return tags;
  }

  // ── Internal ──────────────────────────────────────────────────

  private splitFrontmatter(markdown: string): { frontmatter: string | null; body: string } {
    if (!markdown.startsWith('---')) {
      return { frontmatter: null, body: markdown };
    }
    const endIdx = markdown.indexOf('---', 3);
    if (endIdx === -1) {
      return { frontmatter: null, body: markdown };
    }
    return {
      frontmatter: markdown.substring(0, endIdx + 3),
      body: markdown.substring(endIdx + 3).trim(),
    };
  }

  private parseSections(body: string): FilteredSection[] {
    const sections: FilteredSection[] = [];
    const lines = body.split('\n');

    let currentHeading = '';
    let currentContent: string[] = [];
    let currentDepts: string[] = [];

    for (const line of lines) {
      // Detect H2 heading (## Title)
      if (line.startsWith('## ')) {
        // Save previous section if exists
        if (currentHeading) {
          sections.push({
            heading: currentHeading,
            content: currentContent.join('\n'),
            departments: currentDepts,
          });
        }
        currentHeading = line;
        currentContent = [];
        currentDepts = [];
        continue;
      }

      // Detect department tag comment (immediately after heading)
      const deptMatch = line.match(/<!--\s*dept:(.+?)\s*-->/);
      if (deptMatch && currentContent.length === 0) {
        currentDepts = deptMatch[1]!.split(',').map((d) => d.trim());
        currentContent.push(line);
        continue;
      }

      currentContent.push(line);
    }

    // Save last section
    if (currentHeading) {
      sections.push({
        heading: currentHeading,
        content: currentContent.join('\n'),
        departments: currentDepts,
      });
    }

    // Handle content before first H2 (intro/title section — always visible)
    const firstH2Idx = lines.findIndex((l) => l.startsWith('## '));
    if (firstH2Idx > 0) {
      const introContent = lines
        .slice(0, firstH2Idx)
        .filter((l) => !l.startsWith('# '))
        .join('\n')
        .trim();
      // Only add intro section if there's actual content (not just whitespace)
      if (introContent.length > 0) {
        sections.unshift({
          heading: lines.find((l) => l.startsWith('# ')) ?? '# Concept',
          content: introContent,
          departments: ['all'],
        });
      }
    }

    return sections;
  }
}
