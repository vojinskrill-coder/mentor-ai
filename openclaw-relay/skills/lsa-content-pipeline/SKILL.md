# SKILL: Content Pipeline for LSA (Luxury Studio Architecture)

You are executing a structured content creation pipeline. Follow each step exactly.
Return ONLY valid JSON matching the output schema for your current step.

---

## Step 1: Topic Selection
**Agent:** research
**Tool:** brave-search

Analyze SEO gaps and trending topics in luxury architecture, high-end interior design, and premium real estate. Select a topic aligned with LSA's positioning as a gallery-curator brand.

Consider:
- What competitors are publishing
- SEO keyword gaps (high volume, low competition)
- Seasonal/trend relevance
- LSA brand alignment (luxury, dramatic, exclusive)

**Output Schema:**
```json
{
  "type": "object",
  "required": ["topic", "keywords", "targetChannel", "reasoning"],
  "properties": {
    "topic": { "type": "string", "description": "Selected topic title" },
    "keywords": {
      "type": "array", "minItems": 5, "maxItems": 15,
      "items": { "type": "string" }
    },
    "targetChannel": { "type": "string", "enum": ["blog", "instagram", "linkedin", "all"] },
    "reasoning": { "type": "string", "description": "Why this topic was chosen" },
    "seoData": {
      "type": "object",
      "properties": {
        "estimatedVolume": { "type": "string" },
        "difficulty": { "type": "string", "enum": ["low", "medium", "high"] },
        "competitorGap": { "type": "string" }
      }
    }
  }
}
```

---

## Step 2: Research
**Agent:** research
**Tool:** brave-search

Deep research on the selected topic. Collect authoritative sources, key data points, competitor content analysis, and identify a unique angle for LSA.

**Output Schema:**
```json
{
  "type": "object",
  "required": ["sources", "keyPoints", "competitorAnalysis", "uniqueAngle"],
  "properties": {
    "sources": {
      "type": "array", "minItems": 5,
      "items": {
        "type": "object",
        "required": ["title", "url", "relevance"],
        "properties": {
          "title": { "type": "string" },
          "url": { "type": "string", "format": "uri" },
          "relevance": { "type": "string" },
          "keyQuote": { "type": "string" }
        }
      }
    },
    "keyPoints": { "type": "array", "minItems": 5, "items": { "type": "string" } },
    "competitorAnalysis": { "type": "string", "description": "What competitors published on this topic" },
    "uniqueAngle": { "type": "string", "description": "LSA's differentiated perspective" },
    "dataPoints": { "type": "array", "items": { "type": "string" }, "description": "Statistics, facts, figures" }
  }
}
```

---

## Step 3: Writing
**Agent:** content
**Tool:** seo-content-writer

Write the content in LSA brand voice: professional, elegant, gallery-curator tone. Dark luxury aesthetic. First-person plural ("We at LSA..."). The content should feel exclusive, not salesy.

Requirements:
- Blog post: 1200-2000 words, rich HTML with headings
- Include all target keywords naturally
- Meta description under 160 characters
- Readability score target: 60-70 (Flesch-Kincaid)

**Output Schema:**
```json
{
  "type": "object",
  "required": ["title", "body", "metaDescription", "keywords", "wordCount"],
  "properties": {
    "title": { "type": "string", "maxLength": 70 },
    "body": { "type": "string", "description": "Rich HTML content with headings, paragraphs" },
    "metaDescription": { "type": "string", "maxLength": 160 },
    "keywords": { "type": "array", "items": { "type": "string" } },
    "wordCount": { "type": "integer", "minimum": 1200 },
    "readabilityScore": { "type": "number", "description": "Flesch-Kincaid score" },
    "excerpt": { "type": "string", "maxLength": 300, "description": "Short excerpt for social sharing" }
  }
}
```

---

## Step 4: Visual Generation
**Agent:** content
**Tool:** openart-image

Generate 2-3 visuals matching the content theme in LSA aesthetic:
- Dark, dramatic lighting
- Gold accent colors (#C9A96E)
- Architectural/luxury feel
- High contrast, cinematic mood

**Output Schema:**
```json
{
  "type": "object",
  "required": ["images"],
  "properties": {
    "images": {
      "type": "array", "minItems": 2, "maxItems": 4,
      "items": {
        "type": "object",
        "required": ["url", "alt", "placement"],
        "properties": {
          "url": { "type": "string", "format": "uri" },
          "alt": { "type": "string", "description": "Alt text for accessibility" },
          "placement": { "type": "string", "enum": ["hero", "inline", "footer"] },
          "prompt": { "type": "string", "description": "Generation prompt used" }
        }
      }
    }
  }
}
```

---

## Step 5: Formatting
**Agent:** content
**Tool:** (none - pure formatting)

Combine text + visuals into channel-specific formats:
- **Blog:** Full HTML with images inserted at placement positions, SEO score
- **Instagram:** Caption (max 2200 chars) + hashtags (max 30) + image selection
- **LinkedIn:** Professional post (max 3000 chars) + article preview

**Output Schema:**
```json
{
  "type": "object",
  "required": ["blog", "instagram", "linkedin"],
  "properties": {
    "blog": {
      "type": "object",
      "required": ["html", "seoScore"],
      "properties": {
        "html": { "type": "string", "description": "Complete blog HTML with images" },
        "seoScore": { "type": "integer", "minimum": 0, "maximum": 100 },
        "slug": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } }
      }
    },
    "instagram": {
      "type": "object",
      "required": ["caption", "hashtags"],
      "properties": {
        "caption": { "type": "string", "maxLength": 2200 },
        "hashtags": { "type": "array", "maxItems": 30, "items": { "type": "string" } },
        "imageIndex": { "type": "integer", "description": "Which image to use (0-based)" }
      }
    },
    "linkedin": {
      "type": "object",
      "required": ["post"],
      "properties": {
        "post": { "type": "string", "maxLength": 3000 },
        "articleTitle": { "type": "string" },
        "articleExcerpt": { "type": "string" }
      }
    }
  }
}
```

---

## Step 6: Review
**Type:** APPROVAL

Owner previews:
- Rich HTML blog content with images
- SEO score and keyword analysis
- Instagram caption + hashtags
- LinkedIn post

Can edit text, swap visuals, approve or reject.

---

## Step 7: Publishing
**Agent:** content
**Tool:** ghost-cms

Publish approved content to selected channels.

**Output Schema:**
```json
{
  "type": "object",
  "required": ["publishedUrls"],
  "properties": {
    "publishedUrls": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["channel", "url", "status"],
        "properties": {
          "channel": { "type": "string", "enum": ["blog", "instagram", "linkedin"] },
          "url": { "type": "string", "format": "uri" },
          "status": { "type": "string", "enum": ["published", "scheduled", "draft"] },
          "scheduledAt": { "type": ["string", "null"], "format": "date-time" }
        }
      }
    },
    "scheduledPosts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "channel": { "type": "string" },
          "scheduledAt": { "type": "string", "format": "date-time" },
          "content": { "type": "string" }
        }
      }
    }
  }
}
```
