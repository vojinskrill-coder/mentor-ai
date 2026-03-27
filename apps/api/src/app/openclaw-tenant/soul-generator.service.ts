import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { BusinessProfile } from './business-profile.service';

export interface GeneratedSouls {
  main: string;
  financial: string;
  marketing: string;
  content: string;
  sales: string;
}

const AGENT_ROLES: Record<keyof GeneratedSouls, { title: string; focus: string }> = {
  main: {
    title: 'Glavni poslovni savetnik (CEO perspektiva)',
    focus: 'Poznaje ceo biznis, donosi strateške odluke, koordinira sve aspekte poslovanja. Razume tržište, klijente, proizvode i finansije.',
  },
  financial: {
    title: 'Finansijski direktor',
    focus: 'Specijalizovan za finansijsku analizu, ROI kalkulacije, budžetiranje, cash flow, break-even analize i finansijske projekcije.',
  },
  marketing: {
    title: 'Direktor marketinga (CMO)',
    focus: 'Specijalizovan za brend strategiju, digitalni marketing, content plan, SEO, društvene mreže, pozicioniranje i vizuelni identitet.',
  },
  content: {
    title: 'Kreativni direktor',
    focus: 'Specijalizovan za kreiranje vizuelnog sadržaja, copy writing, brošure, prezentacije, social media content, i sav kreativni materijal. Koristi FAL za generisanje slika.',
  },
  sales: {
    title: 'Direktor prodaje',
    focus: 'Specijalizovan za prodajne strategije, CRM, lead generation, objection handling, pricing strategije i relationship building.',
  },
};

@Injectable()
export class SoulGeneratorService {
  private readonly logger = new Logger(SoulGeneratorService.name);
  private readonly geminiApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.geminiApiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
  }

  /**
   * Generate SOUL.MD content for all 5 domain agents based on the business profile.
   * Each SOUL.MD is written in Serbian and customized to the specific business.
   */
  async generateAllSouls(profile: BusinessProfile): Promise<GeneratedSouls> {
    this.logger.log({ message: 'Generating SOUL.MD files', company: profile.companyName });

    const agentTypes = Object.keys(AGENT_ROLES) as Array<keyof GeneratedSouls>;
    const results = await Promise.all(
      agentTypes.map(agentType => this.generateSoul(agentType, profile))
    );

    const souls: GeneratedSouls = {
      main: results[0]!,
      financial: results[1]!,
      marketing: results[2]!,
      content: results[3]!,
      sales: results[4]!,
    };

    this.logger.log({
      message: 'All SOUL.MD files generated',
      company: profile.companyName,
      sizes: Object.fromEntries(agentTypes.map((t, i) => [t, results[i]!.length])),
    });

    return souls;
  }

  private async generateSoul(agentType: keyof GeneratedSouls, profile: BusinessProfile): Promise<string> {
    const role = AGENT_ROLES[agentType]!;

    const prompt = `Generate a SOUL.MD file for an AI agent in SERBIAN language.

AGENT ROLE: ${role.title}
AGENT FOCUS: ${role.focus}

BUSINESS PROFILE:
- Kompanija: ${profile.companyName}
- Industrija: ${profile.industry}
- Opis: ${profile.description}
- Proizvodi: ${Array.isArray(profile.products) ? profile.products.join(', ') : String(profile.products || 'N/A')}
- Usluge: ${Array.isArray(profile.services) ? profile.services.join(', ') : String(profile.services || 'N/A')}
- Ciljni klijenti: ${Array.isArray(profile.targetClients) ? profile.targetClients.join(', ') : String(profile.targetClients || 'N/A')}
- Geografija: ${profile.geography}
- Ton brenda: ${profile.brandVoice}
- Konkurenti: ${Array.isArray(profile.competitors) ? profile.competitors.join(', ') : String(profile.competitors || 'N/A')}
- Jedinstvena vrednost: ${profile.uniqueValue}
- Cenovni rang: ${profile.priceRange}
- Tim: ${profile.teamDescription}
- Vizuelni stil: ${profile.visualStyle}

KONTEKST:
${profile.rawSummary}

Write the SOUL.MD with these sections in Serbian:
1. # Ko sam ja — agent's identity and role within ${profile.companyName}
2. ## Moja ekspertiza — specific domain knowledge for this business
3. ## Kako radim — working methodology, approach, tools I use
4. ## O kompaniji ${profile.companyName} — detailed business context
5. ## Moji klijenti — target audience understanding
6. ## Vizuelni identitet — brand guidelines (especially important for content/marketing agents)
7. ## Pravila — constraints, guidelines:
   - SVE pretrage moraju biti na ENGLESKOM jeziku
   - Sav output mora biti na SRPSKOM jeziku
   - Koristiti markdown formatiranje sa tabelama
   - NE izmišljati podatke — koristiti samo provjerene izvore
   - NE pisati fajlove (write/edit tool) — samo vraćati tekst
   - Svaku činjenicu citirati sa izvorom ako je dostupan

Return ONLY the SOUL.MD content, no wrapping or explanation. Make it specific and actionable — between 500-800 words (2000-3000 characters). Be concise but include all critical business context.`;

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 16000 },
        },
        { timeout: 60_000 }
      );

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const usage = response.data?.usageMetadata;

      this.logger.log({
        message: `SOUL.MD generated for ${agentType}`,
        chars: text.length,
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      });

      return text || this.getFallbackSoul(agentType, profile);
    } catch (error) {
      this.logger.error({
        message: `SOUL.MD generation failed for ${agentType}`,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return this.getFallbackSoul(agentType, profile);
    }
  }

  private getFallbackSoul(agentType: keyof GeneratedSouls, profile: BusinessProfile): string {
    const role = AGENT_ROLES[agentType]!;
    return `# ${role.title} — ${profile.companyName}

Ja sam ${role.title} za ${profile.companyName}.

## Moja ekspertiza
${role.focus}

## O kompaniji
${profile.description}
- Industrija: ${profile.industry}
- Proizvodi: ${Array.isArray(profile.products) ? profile.products.join(', ') : String(profile.products || 'N/A')}
- Usluge: ${Array.isArray(profile.services) ? profile.services.join(', ') : String(profile.services || 'N/A')}

## Pravila
- SVE pretrage na ENGLESKOM jeziku
- Sav output na SRPSKOM jeziku
- Markdown formatiranje sa tabelama
- NE izmišljati podatke
- NE pisati fajlove — samo vraćati tekst
`;
  }
}
