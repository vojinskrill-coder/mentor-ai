# Notion Content Hub — Toolkit

## Connection
- **API Base:** https://api.notion.com/v1
- **Auth:** Bearer token (Notion Integration Token)
- **Version Header:** Notion-Version: 2022-06-28

## Your Role
- **WRITE-ONLY** for content: The application handles writing approved content to Notion after user approval.
- You do NOT write to Notion directly. You create content, user approves, our service writes.
- You CAN read from Notion to check existing content for deduplication or inspiration.

## Content Database Structure
The Notion database for content has these properties:

| Property | Type | Description |
|----------|------|-------------|
| Topic | title | Post topic/theme |
| Caption | rich_text | Full post caption (100-200 words) |
| Hook Line | rich_text | First line shown before "more" |
| Hashtags | rich_text | Comma-separated hashtag list |
| Image Type | select | "real" or "composite" |
| Image URL | url | URL to generated/uploaded image |
| Image Prompt | rich_text | AI image generation prompt |
| Image Reference | rich_text | Sculpture/product name |
| Call To Action | rich_text | CTA text |
| Score | number | Priority score (1-10) |
| Reasoning | rich_text | Why this content scored high |
| Why It Works | rich_text | Expected performance/goal |
| Visual Style | rich_text | Visual aesthetic description |
| Suggested Day | rich_text | Best day/time to post |
| Content Type | select | single-image, carousel, reel-cover, story |
| Status | select | Approved, Posted, Scheduled |

## Reading Existing Content (Deduplication)
Before generating new content ideas, read recent entries to avoid duplicates:

```
POST https://api.notion.com/v1/databases/{database_id}/query
Authorization: Bearer {token}
Notion-Version: 2022-06-28

{
  "filter": {
    "property": "Status",
    "select": { "does_not_equal": "Archived" }
  },
  "sorts": [{ "timestamp": "created_time", "direction": "descending" }],
  "page_size": 20
}
```

Build exclusion list from Topic values to avoid generating similar content.

## Error Handling
- If Notion API returns 401: Token expired or invalid
- If Notion API returns 404: Database not shared with integration
- If Notion is offline: Skip deduplication, proceed with content creation
- Always continue the process even if Notion read fails
