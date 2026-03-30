# SKILL: Lead Discovery for LSA (Luxury Studio Architecture)

You are executing a structured lead discovery process. Follow each step exactly.
Return ONLY valid JSON matching the output schema for your current step.

---

## Step 1: Market Research
**Agent:** research
**Tool:** brave-search

Search for luxury architecture firms, high-end interior designers, and premium real estate developers in the Balkans and DACH region.

Focus on:
- Companies that recently completed luxury projects
- Firms expanding into new markets
- Companies with outdated web presence (opportunity for LSA services)

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "leads": {
      "type": "array",
      "minItems": 20,
      "items": {
        "type": "object",
        "required": ["name", "company", "website", "location", "source"],
        "properties": {
          "name": { "type": "string", "description": "Contact person name if found, otherwise company name" },
          "company": { "type": "string" },
          "website": { "type": "string", "format": "uri" },
          "location": { "type": "string", "description": "City, Country" },
          "source": { "type": "string", "description": "URL where this lead was found" },
          "notes": { "type": "string", "description": "Why this is a good lead" }
        }
      }
    },
    "searchQueries": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["leads", "searchQueries"]
}
```

---

## Step 2: Lead Enrichment
**Agent:** research
**Tool:** brave-search, web_fetch

For each lead from Step 1, find:
- Decision maker name and role (CEO, Creative Director, etc.)
- Email address (look in website contact pages, LinkedIn, industry directories)
- LinkedIn profile URL
- Recent projects or news

**Verification Rules:**
- Every email MUST have its domain DNS MX record verified
- If email cannot be verified, set to null (NEVER hallucinate emails)
- LinkedIn URLs must start with https://linkedin.com/ or https://www.linkedin.com/

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "enrichedLeads": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "company", "website", "location", "role"],
        "properties": {
          "name": { "type": "string" },
          "company": { "type": "string" },
          "website": { "type": "string", "format": "uri" },
          "location": { "type": "string" },
          "role": { "type": "string" },
          "email": { "type": ["string", "null"], "format": "email" },
          "emailVerified": { "type": "boolean", "description": "true if DNS MX verified" },
          "linkedin": { "type": ["string", "null"], "format": "uri" },
          "recentProjects": { "type": "array", "items": { "type": "string" } },
          "companySize": { "type": ["string", "null"], "description": "small/medium/large" },
          "source": { "type": "string" }
        }
      }
    }
  },
  "required": ["enrichedLeads"]
}
```

---

## Step 3: Lead Scoring
**Agent:** main
**Tool:** (none - pure analysis)

Score each enriched lead 1-10 based on:
- **Fit (0-3):** Does their work align with LSA luxury architecture services?
- **Accessibility (0-3):** Do we have verified contact info? Decision maker identified?
- **Timing (0-2):** Recent activity suggesting they need services now?
- **Size (0-2):** Company size appropriate for LSA services?

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "scoredLeads": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "company", "score", "scoreBreakdown"],
        "properties": {
          "name": { "type": "string" },
          "company": { "type": "string" },
          "website": { "type": "string" },
          "location": { "type": "string" },
          "role": { "type": "string" },
          "email": { "type": ["string", "null"] },
          "emailVerified": { "type": "boolean" },
          "linkedin": { "type": ["string", "null"] },
          "score": { "type": "integer", "minimum": 1, "maximum": 10 },
          "scoreBreakdown": {
            "type": "object",
            "properties": {
              "fit": { "type": "integer", "minimum": 0, "maximum": 3 },
              "accessibility": { "type": "integer", "minimum": 0, "maximum": 3 },
              "timing": { "type": "integer", "minimum": 0, "maximum": 2 },
              "size": { "type": "integer", "minimum": 0, "maximum": 2 }
            },
            "required": ["fit", "accessibility", "timing", "size"]
          },
          "reasoning": { "type": "string" }
        }
      }
    }
  },
  "required": ["scoredLeads"]
}
```

---

## Step 4: Personalized Message Drafting
**Agent:** content
**Tool:** (none - pure generation)

For each lead with score >= 6, draft a personalized outreach message.
Use LSA brand voice: professional, elegant, gallery-curator tone.
Reference their specific projects or company work.

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "outreachLeads": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "company", "score", "message"],
        "properties": {
          "name": { "type": "string" },
          "company": { "type": "string" },
          "email": { "type": ["string", "null"] },
          "linkedin": { "type": ["string", "null"] },
          "score": { "type": "integer" },
          "message": {
            "type": "object",
            "properties": {
              "subject": { "type": "string", "maxLength": 100 },
              "body": { "type": "string", "description": "Personalized email body, 150-250 words" },
              "linkedinNote": { "type": "string", "maxLength": 300, "description": "Short LinkedIn connection note" }
            },
            "required": ["subject", "body"]
          },
          "personalizationPoints": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  },
  "required": ["outreachLeads"]
}
```

---

## Step 5: Human Review
**Type:** APPROVAL

Owner reviews scored leads and personalized messages.
Can approve, edit messages, or skip individual leads.

---

## Step 6: Export & Delivery
**Agent:** main
**Tool:** (none)

Compile approved leads into final deliverable format.

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "summary": {
      "type": "object",
      "properties": {
        "totalResearched": { "type": "integer" },
        "totalEnriched": { "type": "integer" },
        "totalScored": { "type": "integer" },
        "totalApproved": { "type": "integer" },
        "averageScore": { "type": "number" },
        "topCompanies": { "type": "array", "items": { "type": "string" } }
      }
    },
    "approvedLeads": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "company": { "type": "string" },
          "email": { "type": ["string", "null"] },
          "linkedin": { "type": ["string", "null"] },
          "score": { "type": "integer" },
          "message": { "type": "object" },
          "status": { "type": "string", "enum": ["ready", "needs_email", "linkedin_only"] }
        }
      }
    }
  },
  "required": ["summary", "approvedLeads"]
}
```
