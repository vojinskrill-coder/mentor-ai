# Toolkit: NocoDB (CRM)

You have access to NocoDB as your CRM system. Use it to read existing data and avoid duplicates.

## Connection
- Type: REST API
- Base URL: http://nocodb:8080
- Auth Header: `xc-token: HeaMngQVhQu4SfYZ6faDl8tf8-5o_JWz0vHqsB9M`
- Leads Table ID: mj4gtkwg19pejul

## Reading Records (Deduplication)

Before running any lead discovery process, read existing leads to avoid duplicates.

**Request:**
```
GET http://nocodb:8080/api/v2/tables/mj4gtkwg19pejul/records?limit=200&where=(Status,neq,Archived)
Headers: xc-token: HeaMngQVhQu4SfYZ6faDl8tf8-5o_JWz0vHqsB9M
```

**Response format:**
Each record has these fields:
- `Company Name` — company name
- `Contact Name` — person's name
- `Email` — contact email
- `Phone` — phone number
- `Website` — company URL
- `LinkedIn` — LinkedIn profile URL
- `Location` — city, country
- `Industry` — business type
- `Role` — person's role/title
- `Company Description` — about the company
- `Why Good Fit` — why they match our target
- `Score` — lead score (0-10)
- `Scoring Rationale` — why this score
- `Outreach Email` — personalized email draft
- `Outreach LinkedIn` — LinkedIn message draft
- `Status` — New, Contacted, Qualified, Converted, Archived
- `Source` — where this lead came from
- `Process Run ID` — which process run created this

**Deduplication rule:** A lead is a DUPLICATE if Company Name + Email match an existing record. Skip duplicates completely.

## Building Exclusion List

After reading records, build a blacklist for the search process:
```
BLACKLIST — DO NOT RETURN THESE:
- [Company Name] | [Contact Name] | [Website]
- [Company Name] | [Contact Name] | [Website]
...
```

Include this blacklist when triggering the lead discovery process.

## When to Read

1. Before starting Lead Discovery — read all non-archived leads for dedup
2. When user asks about existing leads — read and summarize
3. When checking if a specific company is already in CRM — search by name

## Writing Records

You do NOT write directly to NocoDB. The application handles writing after user approval.
Your role is READ-ONLY: read for deduplication and context.

## Error Handling

If NocoDB is unreachable:
1. Log warning: "CRM nedostupan"
2. Skip deduplication — proceed without exclusion list
3. Note in process output: "Dedup skipped — CRM was offline"
