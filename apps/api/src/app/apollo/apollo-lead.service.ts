import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Apollo.io REST API service for lead operations.
 *
 * Replaces NocoDB as the primary lead storage/retrieval tool.
 * Apollo stores contacts in your account — they can be searched,
 * enriched, and organized into lists. This service wraps the
 * relevant endpoints with the same interface shape the MCP
 * controller expects.
 *
 * Key endpoints used:
 *   - POST /v1/mixed_people/search      (find people by title/company/domain)
 *   - POST /v1/organizations/search     (find companies by keywords/location)
 *   - GET  /v1/organizations/enrich     (enrich a single domain)
 *   - POST /v1/contacts                 (save a contact to your account)
 *   - POST /v1/people/match             (enrich by email)
 *   - GET  /v1/contacts/search          (search your saved contacts)
 */
@Injectable()
export class ApolloLeadService {
  private readonly logger = new Logger(ApolloLeadService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.apollo.io';

  constructor(private readonly config: ConfigService) {
    this.apiKey =
      this.config.get<string>('APOLLO_API_KEY') ?? '';
    if (!this.apiKey) {
      this.logger.warn('APOLLO_API_KEY not set — Apollo lead operations will fail');
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // READ: List leads from your Apollo saved contacts
  // ──────────────────────────────────────────────────────────────────

  /**
   * Search saved contacts in your Apollo account.
   * Used by MCP GET /leads endpoint and for dedup context.
   */
  async listSavedContacts(options?: {
    limit?: number;
    page?: number;
    query?: string;
    labelIds?: string[];
  }): Promise<Array<Record<string, unknown>>> {
    const body: Record<string, unknown> = {
      page: options?.page ?? 1,
      per_page: options?.limit ?? 100,
    };
    if (options?.query) {
      body.q_keywords = options.query;
    }
    if (options?.labelIds?.length) {
      body.label_ids = options.labelIds;
    }

    const res = await this.post('/v1/contacts/search', body);
    const contacts = (res as { contacts?: unknown[] })?.contacts ?? [];
    return contacts.map((c) => this.mapFromApollo(c as Record<string, unknown>));
  }

  /**
   * Search people across Apollo's full 200M+ database.
   * Used by lead-discovery process for finding NEW leads.
   */
  async searchPeople(params: {
    personTitles?: string[];
    organizationDomains?: string[];
    organizationKeywords?: string[];
    organizationLocations?: string[];
    employeeRanges?: string[];
    page?: number;
    perPage?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const body: Record<string, unknown> = {
      page: params.page ?? 1,
      per_page: params.perPage ?? 25,
    };
    if (params.personTitles?.length) body.person_titles = params.personTitles;
    if (params.organizationDomains?.length) body.q_organization_domains = params.organizationDomains;
    if (params.organizationKeywords?.length) body.q_organization_keyword_tags = params.organizationKeywords;
    if (params.organizationLocations?.length) body.organization_locations = params.organizationLocations;
    if (params.employeeRanges?.length) body.organization_num_employees_ranges = params.employeeRanges;

    const res = await this.post('/v1/mixed_people/search', body);
    const people = (res as { people?: unknown[] })?.people ?? [];
    return people.map((p) => this.mapFromApollo(p as Record<string, unknown>));
  }

  /**
   * Search organizations across Apollo's 60M+ database.
   */
  async searchOrganizations(params: {
    keywords?: string[];
    locations?: string[];
    employeeRanges?: string[];
    page?: number;
    perPage?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const body: Record<string, unknown> = {
      page: params.page ?? 1,
      per_page: params.perPage ?? 25,
    };
    if (params.keywords?.length) body.q_organization_keyword_tags = params.keywords;
    if (params.locations?.length) body.organization_locations = params.locations;
    if (params.employeeRanges?.length) body.organization_num_employees_ranges = params.employeeRanges;

    const res = await this.post('/v1/organizations/search', body);
    const orgs = (res as { organizations?: unknown[] })?.organizations ?? [];
    return orgs.map((o) => this.mapOrgFromApollo(o as Record<string, unknown>));
  }

  /**
   * Enrich a single organization by domain.
   */
  async enrichOrganization(domain: string): Promise<Record<string, unknown> | null> {
    const res = await this.get(`/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`);
    const org = (res as { organization?: Record<string, unknown> })?.organization;
    return org ? this.mapOrgFromApollo(org) : null;
  }

  /**
   * Enrich a person by email.
   */
  async enrichPerson(email: string): Promise<Record<string, unknown> | null> {
    const res = await this.post('/v1/people/match', {
      email,
      reveal_personal_emails: true,
    });
    const person = (res as { person?: Record<string, unknown> })?.person;
    return person ? this.mapFromApollo(person) : null;
  }

  // ──────────────────────────────────────────────────────────────────
  // WRITE: Save approved leads to your Apollo account
  // ──────────────────────────────────────────────────────────────────

  /**
   * Save leads as contacts in your Apollo account.
   * Called by MCP POST /leads/approve endpoint.
   */
  async saveContacts(
    leads: Array<Record<string, unknown>>,
  ): Promise<{ saved: number; errors: string[] }> {
    let saved = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const apolloPayload = this.mapToApollo(lead);
        await this.post('/v1/contacts', apolloPayload);
        saved++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn({
          message: 'Apollo save contact failed',
          name: lead.name,
          company: lead.company,
          error: msg,
        });
        errors.push(`${lead.name}: ${msg}`);
      }
    }

    this.logger.log({ message: 'Apollo save contacts batch', saved, errors: errors.length });
    return { saved, errors };
  }

  // ──────────────────────────────────────────────────────────────────
  // DEDUP: Build deduplication context from saved contacts
  // ──────────────────────────────────────────────────────────────────

  /**
   * Build a dedup blacklist string from saved Apollo contacts.
   * Returns "Name (Company) — URL\n" lines for agent context injection.
   */
  async buildDedupContext(limit = 200): Promise<string> {
    try {
      const contacts = await this.listSavedContacts({ limit });
      if (!contacts.length) return '';
      return contacts
        .map((c) => {
          const name = c.name || 'Unknown';
          const company = c.company || '';
          const url = c.linkedin || c.website || '';
          return `${name} (${company})${url ? ' — ' + url : ''}`;
        })
        .join('\n');
    } catch (e) {
      this.logger.warn({
        message: 'Apollo dedup context failed, returning empty',
        error: e instanceof Error ? e.message : String(e),
      });
      return '';
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // MAPPING: Apollo ↔ Internal lead format
  // ──────────────────────────────────────────────────────────────────

  /** Map Apollo person object → our internal LeadData shape */
  private mapFromApollo(p: Record<string, unknown>): Record<string, unknown> {
    const org = (p.organization as Record<string, unknown>) ?? {};
    return {
      apolloId: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.name as string) || '',
      company: (org.name as string) || (p.organization_name as string) || '',
      role: (p.title as string) || '',
      email: (p.email as string) || '',
      emailSource: p.email_status === 'verified' ? 'verified' : 'apollo',
      linkedin: (p.linkedin_url as string) || '',
      phone: this.extractPhone(p),
      website: (org.website_url as string) || (org.primary_domain as string) || '',
      location: [p.city, p.state, p.country].filter(Boolean).join(', '),
      industry: (org.industry as string) || '',
      companyDescription: (org.short_description as string) || '',
      employees: org.estimated_num_employees ?? null,
      revenue: org.organization_revenue ?? null,
      revenueFormatted: (org.organization_revenue_printed as string) || '',
      keywords: (org.keywords as string[]) || [],
      technologies: (org.technologies as string[]) || [],
      seniority: (p.seniority as string) || '',
      departments: (p.departments as string[]) || [],
    };
  }

  /** Map Apollo organization object → our internal format */
  private mapOrgFromApollo(o: Record<string, unknown>): Record<string, unknown> {
    return {
      apolloId: o.id,
      name: (o.name as string) || '',
      website: (o.website_url as string) || '',
      domain: (o.primary_domain as string) || '',
      linkedin: (o.linkedin_url as string) || '',
      phone: (o.phone as string) || '',
      industry: (o.industry as string) || '',
      employees: o.estimated_num_employees ?? null,
      revenue: o.organization_revenue ?? null,
      revenueFormatted: (o.organization_revenue_printed as string) || '',
      location: [o.city, o.state, o.country].filter(Boolean).join(', '),
      keywords: (o.keywords as string[]) || [],
      technologies: (o.technologies as string[]) || [],
      foundedYear: o.founded_year ?? null,
    };
  }

  /** Map our internal lead → Apollo contact create payload */
  private mapToApollo(lead: Record<string, unknown>): Record<string, unknown> {
    const nameParts = ((lead.name as string) || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    return {
      first_name: firstName,
      last_name: lastName,
      title: lead.role || lead.title || '',
      email: lead.email || undefined,
      organization_name: lead.company || '',
      website_url: lead.website || '',
      linkedin_url: lead.linkedin || '',
      present_raw_address: lead.location || '',
      label_names: ['neuron-approved-lead'],
    };
  }

  private extractPhone(p: Record<string, unknown>): string {
    if (p.phone_numbers && Array.isArray(p.phone_numbers) && p.phone_numbers.length > 0) {
      return (p.phone_numbers[0] as { raw_number?: string })?.raw_number || '';
    }
    return '';
  }

  // ──────────────────────────────────────────────────────────────────
  // HTTP helpers
  // ──────────────────────────────────────────────────────────────────

  private async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Apollo GET ${path}: ${res.status} ${text.substring(0, 200)}`);
    }
    return res.json();
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Apollo POST ${path}: ${res.status} ${text.substring(0, 200)}`);
    }
    return res.json();
  }
}
