---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation', 'step-05-extension-epics']
status: 'complete'
totalEpics: 16
totalStories: 107
frCoverage: '73/73'
extensionRequirements: '14/14'
partyModeReviewScore: '9/10'
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/autonomous-business-brain-architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
project_name: 'Mentor AI + Autonomous Business Brain'
date: '2026-02-06'
extensionDate: '2026-02-06'
---

# Mentor AI - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Mentor AI, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**User Management & Authentication (FR1-FR8):**
- FR1: Users can sign up via self-service with company name, industry selection, business description, and icon/image
- FR2: Users can authenticate via Google OAuth 2.0 with mandatory 2FA
- FR3: Users can receive recovery codes during 2FA setup for account recovery
- FR4: Tenant Owners can invite team members via email with department/role assignment
- FR5: Tenant Owners can remove team members from their workspace
- FR6: Tenant Owners can designate backup Owner for account recovery
- FR7: Users can export all their data (notes, conversations, client profiles) in PDF/Markdown/JSON format
- FR8: Tenant Owners can request full tenant deletion with GDPR-compliant purge

**AI Task Execution & Guidance (FR9-FR18):**
- FR9: Users can interact with AI via text conversations to request business task execution
- FR10: Users can interact with AI via voice commands (STT and TTS)
- FR11: AI can execute business tasks across all functions using department personas (CFO/CMO/CTO/Operations/Legal/Creative)
- FR12: AI can provide confidence scores on all guidance and task outputs
- FR13: AI can cite specific business concepts (from 600-concept knowledge base) used in task execution
- FR14: Users can provide feedback/corrections on AI outputs to improve future responses
- FR15: AI can remember client/project-specific context across conversations (mandatory persistent memory)
- FR16: AI can apply department guardrails preventing cross-functional data leakage
- FR17: Users can disable department persona switching and use unified "Business Partner" mode
- FR18: AI can detect and prevent execution of recursive/infinite loop workflows

**Knowledge Base & Learning (FR19-FR25):**
- FR19: Users can access 600 proprietary business concepts organized by business function
- FR20: Users can click concept references in AI responses to view detailed concept pages
- FR21: System can track concept engagement per user (which concepts viewed, frequency)
- FR22: Tenant Owners can upload Business Brain (PDF with Obsidian notes) to define company-specific guardrails
- FR23: System can sanitize uploaded Business Brain PDFs (strip executable content, detect prompt injection)
- FR24: System can version Business Brain uploads with rollback capability
- FR25: System can filter AI outputs to prevent sensitive data leakage across departments

**Client/Project Management (FR26-FR32):**
- FR26: Users can create client profiles with context (industry, constraints, preferences)
- FR27: Users can create project profiles associated with clients
- FR28: AI can automatically apply client/project context when executing tasks
- FR29: Users can save task outputs as structured notes (Section/Subsection/Task Name format)
- FR30: Users can search notes within their tenant workspace
- FR31: Users can edit saved notes
- FR32: System can filter notes by department guardrails

**Team Collaboration & Administration (FR33-FR39):**
- FR33: Tenant Owners can view team adoption dashboard (tasks completed, time saved, cost avoided per member)
- FR34: Tenant Owners can view ROI calculator comparing Mentor AI cost vs consultant costs avoided
- FR35: Tenant Owners can configure department guardrails for team members
- FR36: Team Members can view their own task history and conversation history
- FR37: Tenant Owners can view aggregate team metrics (NOT individual conversations)
- FR38: System can track visible value metrics (10X productivity gains, time/cost savings)
- FR39: System can generate "sub-5-minute first value" quick win during onboarding

**Integrations & Data Export (FR40-FR47):**
- FR40: Users can connect HubSpot account via OAuth2 for one-click export
- FR41: Users can connect Google Analytics account via OAuth2 for one-click export
- FR42: Users can connect Figma account via OAuth2 for one-click export
- FR43: System can automatically refresh OAuth tokens 7 days before expiry
- FR44: Users can disconnect integrations and revoke OAuth tokens
- FR45: Users can export task outputs natively (independent of third-party integrations)
- FR46: Tenant Owners can view integration health dashboard showing connection status
- FR47: System can notify users via email + in-app alerts when integrations fail

**Platform Administration (FR48-FR56):**
- FR48: Platform Owner can configure LLM model selection (cloud OpenRouter vs local Llama 3.1)
- FR49: Platform Owner can configure vector store settings (Qdrant)
- FR50: Platform Owner can configure database settings (PostgreSQL)
- FR51: Platform Owner can view cross-tenant analytics (user counts, task execution, infrastructure costs)
- FR52: Platform Owner can view tenant health metrics (tasks/user, NPS, retention, adoption)
- FR53: Platform Owner can monitor AI provider rate limits with alerts at 70%, 85%, 95%
- FR54: System can automatically failover between AI providers (OpenAI → Anthropic)
- FR55: System can queue AI requests with priority (Owner > Team Member)
- FR56: Platform can display public status page showing service health and incidents

**Security, Compliance & Billing (FR57-FR73):**
- FR57: System can isolate tenant data completely (separate PostgreSQL + Qdrant namespace per tenant)
- FR58: System can validate tenant_id on every database query at middleware layer
- FR59: System can detect anomalous cross-tenant access attempts in real-time
- FR60: System can encrypt all data at rest (AES-256) and in transit (TLS 1.3)
- FR61: System can maintain immutable audit logs (no deletion capability)
- FR62: System can execute GDPR-compliant deletion across all systems within 30-day SLA
- FR63: System can anonymize audit logs instead of deleting for 7-year compliance retention
- FR64: Tenant Owners can manage subscription (add/remove users, upgrade/downgrade)
- FR65: System can preview subscription downgrades showing impact
- FR66: System can implement 14-day grace period for downgraded users
- FR67: System can detect orphaned data and auto-reassign to Owner
- FR68: System can implement tenant lifecycle states (DRAFT → ONBOARDING → ACTIVE → SUSPENDED → DELETED)
- FR69: System can auto-delete DRAFT tenants after 30 days of inactivity
- FR70: System can track token consumption per user with anomaly detection
- FR71: Support team can grant emergency token quota override with audit logging
- FR72: Users can receive token consumption forecasting
- FR73: Users can receive soft limit warnings at 70%, 85%, 95% of quota

### Non-Functional Requirements

**Performance (PR1-PR6):**
- PR1: 90% of new users achieve first successful AI task within 5 minutes
- PR2: Average AI task completion ≤ 10 minutes (P90), complex tasks ≤ 15 minutes
- PR3: Voice STT ≤ 3s (P95), TTS TTFB ≤ 500ms
- PR4: Tenant dashboards load ≤ 2s, Platform dashboard ≤ 5s
- PR5: User-facing DB queries ≤ 200ms (P95)
- PR6: Vector search ≤ 100ms (P95)

**Security (SC1-SC6):**
- SC1: AES-256 encryption at rest, TLS 1.3 in transit
- SC2: Zero cross-tenant data access (separate PostgreSQL per tenant)
- SC3: Google OAuth 2.0 with mandatory 2FA
- SC4: Immutable audit logs (7-year retention)
- SC5: 100% Business Brain PDF sanitization and injection detection
- SC6: 100% department guardrail enforcement

**Scalability (SL1-SL5):**
- SL1: Support 100% MoM growth (50 → 2,400 users over 12 months)
- SL2: Tenant provisioning ≤ 5 minutes, support 500 concurrent tenants
- SL3: Local LLM cost ≤ $10/user/month by Month 3
- SL4: Vector DB support 300K vectors with <100ms query
- SL5: 240K tasks/month capacity by Month 12

**Reliability (RL1-RL6):**
- RL1: 99.9% uptime (max 43 min downtime/month)
- RL2: RTO ≤ 4 hours, RPO ≤ 1 hour
- RL3: AI provider failover within 30 seconds
- RL4: Database backups every 4 hours, restore ≤ 2 hours
- RL5: Integration failures don't block core features (circuit breaker pattern)
- RL6: ACID compliance per tenant, eventual consistency ≤ 60s for cross-system

**Integration Quality (IQ1-IQ5):**
- IQ1: OAuth token auto-refresh 7 days before expiry (99% success)
- IQ2: Integration health checks every 15 minutes
- IQ3: 95% first-attempt export success, 99% eventual success
- IQ4: Native export available as fallback (≤ 30s generation)
- IQ5: Zero API bans from rate limit violations

**Usability (UX1-UX6):**
- UX1: 90% onboarding completion within 30 minutes
- UX2: NPS ≥ 40 Month 1, ≥ 50 Month 3
- UX3: 85% concept pages rated "clear and useful"
- UX4: 100% actionable error messages
- UX5: 90% dashboard self-service comprehension
- UX6: 95% voice recognition accuracy

**UI/UX Design Standards (DS1-DS9):**
- DS1: Modern minimalist design (Linear, Stripe, Vercel reference)
- DS2: Dark mode default with WCAG AAA contrast (7:1)
- DS3: Obsidian-style graph visualization for knowledge connections
- DS4: 8px grid system, minimal component design
- DS5: 60fps animations, skeleton loaders, ≤200ms transitions
- DS6: High information density (Tufte principles)
- DS7: Responsive 320px-3840px, ≥44px touch targets
- DS8: WCAG 2.1 Level AA compliance, full keyboard navigation
- DS9: Design system documented in Storybook, 95% component coverage

**Compliance (CP1-CP4):**
- CP1: SOC 2 Type II certification pre-launch
- CP2: GDPR deletion within 30 days, certificate within 24h
- CP3: DPA compliance and availability during signup
- CP4: Security incident detection ≤ 15 minutes, 72-hour breach notification

### Additional Requirements

**From Architecture Document:**

- **Starter Template:** Nx Monorepo with Angular 20 + NestJS must be initialized first (Epic 1, Story 1)
- **Multi-Tenancy:** Physical tenant isolation with separate PostgreSQL databases and TenantPrismaService for connection routing
- **AI Gateway Pattern:** Centralized service for LLM/TTS/Image operations with queue, cost tracking, circuit breaker
- **Streaming Response Pattern:** HTTP POST initiation + WebSocket streaming for AI responses
- **Concept Graph Pattern:** Hierarchical embeddings with hybrid retrieval (vector + BM25)
- **Connection Pooling:** Max 10 connections per tenant, 30s idle timeout
- **Correlation IDs:** X-Correlation-Id header on all requests for distributed tracing
- **RFC 7807 Error Format:** ProblemDetails for all API errors
- **Angular Signals:** Mandatory for all component state (no BehaviorSubjects)
- **ID Prefixes:** All entities must use prefixed IDs (usr_, tnt_, sess_, msg_, cpt_, prs_)
- **Auth0 Integration:** JWT with tenant_id in claims, RBAC (Platform Owner, Tenant Owner, Team Member)
- **Day 1 Infrastructure:** Auth0, Railway, PostgreSQL, Upstash Redis, Qdrant, Sentry, GitHub Actions

**From UX Design Document:**

- **Dark Mode First:** Black minimalist interface (#0A0A0A background)
- **Graph Visualization:** Sigma.js (WebGL) for 60fps knowledge graph rendering
- **Voice Interface:** Real-time Whisper STT + Azure TTS streaming
- **Persona Avatars:** Visual indicators for CFO/CMO/CTO/Operations/Legal/Creative
- **Confidence Indicators:** Visual display of AI confidence scores
- **Onboarding Flow:** 3-step wizard (Account → Business Context → First Task)
- **Value Dashboard:** Time saved, cost avoided, tasks completed metrics
- **Accessibility:** ARIA labels, keyboard navigation, screen reader support

### FR Coverage Map

FR1: Epic 1 - User self-service signup with company details
FR2: Epic 1 - Google OAuth 2.0 with mandatory 2FA
FR3: Epic 1 - Recovery codes during 2FA setup
FR4: Epic 1 - Team member invitation with department/role
FR5: Epic 1 - Team member removal
FR6: Epic 1 - Backup Owner designation
FR7: Epic 1 - User data export (PDF/Markdown/JSON)
FR8: Epic 1 - Tenant deletion with GDPR purge
FR9: Epic 2 - Text conversation AI interaction
FR10: Epic 2 - Voice commands (STT/TTS)
FR11: Epic 2 - Department persona task execution
FR12: Epic 2 - AI confidence scores
FR13: Epic 2 - Business concept citations
FR14: Epic 2 - User feedback on AI outputs
FR15: Epic 2 - Persistent memory across conversations
FR16: Epic 2 - Department guardrails
FR17: Epic 2 - Unified Business Partner mode
FR18: Epic 2 - Recursive workflow detection
FR19: Epic 3 - 600 business concepts access
FR20: Epic 3 - Concept detail pages
FR21: Epic 3 - Concept engagement tracking
FR22: Epic 3 - Business Brain upload
FR23: Epic 3 - PDF sanitization
FR24: Epic 3 - Business Brain versioning
FR25: Epic 3 - Sensitive data filtering
FR26: Epic 4 - Client profile creation
FR27: Epic 4 - Project profile creation
FR28: Epic 4 - Auto-apply client/project context
FR29: Epic 4 - Save task outputs as notes
FR30: Epic 4 - Search notes
FR31: Epic 4 - Edit saved notes
FR32: Epic 4 - Filter notes by guardrails
FR33: Epic 5 - Team adoption dashboard
FR34: Epic 5 - ROI calculator
FR35: Epic 5 - Department guardrails configuration
FR36: Epic 5 - Team member task/conversation history
FR37: Epic 5 - Aggregate team metrics
FR38: Epic 5 - Visible value metrics tracking
FR39: Epic 2 - Sub-5-minute first value onboarding (moved for early value)
FR40: Epic 6 - HubSpot OAuth connection
FR41: Epic 6 - Google Analytics OAuth connection
FR42: Epic 6 - Figma OAuth connection
FR43: Epic 6 - OAuth token auto-refresh
FR44: Epic 6 - Integration disconnect/revoke
FR45: Epic 6 - Native export (independent of integrations)
FR46: Epic 6 - Integration health dashboard
FR47: Epic 6 - Integration failure notifications
FR48: Epic 1 - LLM model selection (moved to Day 1 Foundation)
FR49: Epic 7 - Vector store settings
FR50: Epic 7 - Database settings
FR51: Epic 7 - Cross-tenant analytics
FR52: Epic 7 - Tenant health metrics
FR53: Epic 7 - Rate limit monitoring
FR54: Epic 7 - AI provider failover
FR55: Epic 7 - Request queue with priority
FR56: Epic 7 - Public status page
FR57: Epic 9 - Tenant data isolation
FR58: Epic 9 - Tenant ID validation middleware
FR59: Epic 9 - Cross-tenant access detection
FR60: Epic 9 - Data encryption (AES-256, TLS 1.3)
FR61: Epic 9 - Immutable audit logs
FR62: Epic 9 - GDPR-compliant deletion
FR63: Epic 9 - Audit log anonymization
FR64: Epic 8 - Subscription management
FR65: Epic 8 - Downgrade preview
FR66: Epic 8 - 14-day grace period
FR67: Epic 8 - Orphaned data reassignment
FR68: Epic 8 - Tenant lifecycle states
FR69: Epic 8 - Auto-delete inactive DRAFT tenants
FR70: Epic 8 - Token consumption tracking
FR71: Epic 8 - Emergency token override
FR72: Epic 8 - Token consumption forecasting
FR73: Epic 8 - Soft limit warnings

## Epic List

### Epic 1: Foundation & Authentication
Users can create accounts, authenticate securely, manage team membership, and access the platform with proper identity verification and role-based access.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR48
**Day 1 Infrastructure:** Nx Monorepo initialization, Auth0 setup, PostgreSQL multi-tenant foundation, design system (Tailwind + Spartan UI), health check endpoints, LLM provider configuration
**Enables:** All subsequent epics depend on authentication and tenant infrastructure

### Epic 2: AI Conversation & Task Execution
Users can interact with the AI assistant through text and voice to execute business tasks, receiving confidence-scored guidance with concept citations and persistent context memory.
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR39
**Story Order:** Text conversation first → First value quick win (FR39) → Department personas → Confidence/citations → Feedback → Guardrails → Voice (last, most complex)
**Enables:** Knowledge Base integration, Client context application

### Epic 3: Knowledge Base & Business Concepts
Users can access and explore 600 proprietary business concepts with graph visualization, upload Business Brain documents, and benefit from AI-powered concept recommendations.
**FRs covered:** FR19, FR20, FR21, FR22, FR23, FR24, FR25
**Enables:** Enhanced AI guidance with domain-specific knowledge

### Epic 4: Client & Project Context Management
Users can create and manage client profiles and projects, with AI automatically applying relevant context to task execution and organizing outputs as searchable notes.
**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31, FR32
**Enables:** Personalized AI assistance per client/project

### Epic 5: Team Collaboration & Tenant Administration
Tenant Owners can manage team members, view adoption metrics, configure department guardrails, and track ROI through comprehensive dashboards.
**FRs covered:** FR33, FR34, FR35, FR36, FR37, FR38
**Includes:** Assisted onboarding journey, team adoption tracking, value demonstration metrics
**Enables:** Multi-user workspace collaboration

### Epic 6: Integrations & Data Export
Users can connect external tools (HubSpot, Google Analytics, Figma) via OAuth, export task outputs to these platforms, and manage integration health with automatic token refresh.
**FRs covered:** FR40, FR41, FR42, FR43, FR44, FR45, FR46, FR47
**Enables:** Workflow integration with existing business tools

### Epic 7: Platform Administration
Platform Owners can configure infrastructure settings, monitor cross-tenant analytics, manage AI provider failover, and maintain system health visibility.
**FRs covered:** FR49, FR50, FR51, FR52, FR53, FR54, FR55, FR56
**Includes:** AI provider failover, request queue prioritization, public status page
**Enables:** Platform-wide operational control

### Epic 8: Subscription & Billing Management
Tenant Owners can manage subscriptions, track token consumption, receive usage forecasts and warnings, with proper lifecycle state management.
**FRs covered:** FR64, FR65, FR66, FR67, FR68, FR69, FR70, FR71, FR72, FR73
**Enables:** Sustainable platform monetization

### Epic 9: Security, Compliance & Data Protection
System implements comprehensive security controls including tenant isolation, encryption, audit logging, and GDPR-compliant data handling.
**FRs covered:** FR57, FR58, FR59, FR60, FR61, FR62, FR63
**Cross-cutting:** Security patterns applied throughout all epics
**Enables:** Enterprise-grade security and regulatory compliance

---

## Epic 1: Foundation & Authentication

Users can create accounts, authenticate securely, manage team membership, and access the platform with proper identity verification and role-based access.

### Story 1.1: Initialize Nx Monorepo with Core Infrastructure

As a **developer**,
I want the Nx monorepo initialized with Angular 20 frontend and NestJS backend applications,
So that I have a properly configured development environment with shared libraries and build tooling.

**Acceptance Criteria:**

**Given** a fresh project directory
**When** the monorepo is initialized
**Then** the following structure exists:
- `apps/web` - Angular 20 application with standalone components
- `apps/api` - NestJS application with module structure
- `libs/shared/types` - Shared TypeScript interfaces
- `libs/shared/utils` - Shared utility functions
**And** `nx serve web` starts the Angular dev server on port 4200
**And** `nx serve api` starts the NestJS server on port 3000
**And** `nx run-many -t test` executes all unit tests
**And** TypeScript strict mode is enabled across all projects
**And** ESLint and Prettier are configured with project rules
**And** Environment configuration supports local/staging/production

**Technical Notes:**
- Use Angular Signals for all component state (no BehaviorSubjects)
- Configure Tailwind CSS v4 with dark mode default
- Set up path aliases (@mentor-ai/shared, @mentor-ai/types)

---

### Story 1.2: Multi-Tenant Database Foundation

As a **platform administrator**,
I want the multi-tenant PostgreSQL infrastructure established,
So that each tenant's data is physically isolated in separate databases.

**Acceptance Criteria:**

**Given** the NestJS API application
**When** the database module is configured
**Then** Prisma 5.x is installed with the base schema containing:
- `Platform` table for global platform settings
- `TenantRegistry` table tracking all tenant databases
**And** TenantPrismaService dynamically routes connections based on tenant_id
**And** connection pooling is configured (max 10 connections per tenant, 30s idle timeout)
**And** database migrations can be applied per-tenant
**And** a seeder creates the platform database on first run

**Given** a request with X-Tenant-Id header
**When** the request reaches any database operation
**Then** the correct tenant database connection is used
**And** queries without tenant context fail with 403 error

**Technical Notes:**
- Use prefixed IDs: tnt_ for tenants, usr_ for users
- Implement correlation ID tracking (X-Correlation-Id header)
- All errors follow RFC 7807 ProblemDetails format

---

### Story 1.3: Design System Setup with Spartan UI

As a **frontend developer**,
I want the design system established with Tailwind CSS and Spartan UI components,
So that I can build consistent, accessible UI components following the dark-mode-first design.

**Acceptance Criteria:**

**Given** the Angular web application
**When** the design system is configured
**Then** Tailwind CSS v4 is installed with custom configuration:
- Primary background: #0A0A0A (dark mode default)
- 8px grid system implemented
- WCAG AAA contrast ratios (7:1) for text
**And** Spartan UI component library is integrated
**And** the following base components are available:
- Button (primary, secondary, ghost variants)
- Input (text, password, with validation states)
- Card (with header, body, footer sections)
- Modal/Dialog with focus trap
**And** all components support keyboard navigation
**And** all components have ARIA labels configured
**And** a Storybook instance documents all components

**Technical Notes:**
- Components must use Angular Signals for internal state
- Follow DS1-DS9 design standards from requirements
- Implement skeleton loaders for loading states

---

### Story 1.4: Health Check Endpoints

As a **platform administrator**,
I want health check endpoints exposed,
So that I can monitor system availability and integrate with load balancers.

**Acceptance Criteria:**

**Given** the NestJS API is running
**When** GET /health is called
**Then** response includes:
- `status`: "healthy" | "degraded" | "unhealthy"
- `timestamp`: ISO 8601 timestamp
- `version`: Application version from package.json
**And** response time is < 100ms

**Given** the NestJS API is running
**When** GET /health/ready is called
**Then** response includes checks for:
- PostgreSQL platform database connectivity
- Redis connectivity (Upstash)
- Memory usage (< 90% threshold)
**And** returns 503 if any critical dependency fails

**Given** the NestJS API is running
**When** GET /health/live is called
**Then** returns 200 with minimal payload for Kubernetes liveness probes

**Technical Notes:**
- Use @nestjs/terminus for health checks
- Implement circuit breaker pattern for dependency checks
- Log health check failures to Sentry

---

### Story 1.5: User Registration and Tenant Creation

As a **new user**,
I want to register for Mentor AI by providing my company details,
So that I can create my workspace and become the Tenant Owner.

**Acceptance Criteria:**

**Given** an unauthenticated user on the registration page
**When** they complete the registration form with:
- Email address (validated format)
- Company name (required, 2-100 characters)
- Industry selection (dropdown with predefined options)
- Business description (optional, max 500 characters)
- Company icon/image upload (optional, max 2MB, PNG/JPG)
**Then** a new tenant is created in DRAFT state
**And** a new tenant database is provisioned
**And** the user is created as Tenant Owner role
**And** the user is redirected to Google OAuth flow

**Given** registration form submission
**When** the email already exists in the platform
**Then** display error: "An account with this email already exists"
**And** offer link to login page

**Given** a company icon is uploaded
**When** the file exceeds 2MB or is wrong format
**Then** display error: "Please upload a PNG or JPG image under 2MB"

**Technical Notes:**
- Create User (usr_), Tenant (tnt_) entities with this story
- Tenant states: DRAFT → ONBOARDING → ACTIVE → SUSPENDED → DELETED
- Store company icon in cloud storage with CDN URL

---

### Story 1.6: Google OAuth Authentication with 2FA

As a **registered user**,
I want to authenticate using Google OAuth with mandatory 2FA,
So that my account is secured with enterprise-grade authentication.

**Acceptance Criteria:**

**Given** a user initiating login
**When** they click "Sign in with Google"
**Then** they are redirected to Google OAuth consent screen
**And** upon successful Google auth, they return to the application

**Given** a user completing Google OAuth for the first time
**When** 2FA is not yet configured
**Then** they are prompted to set up 2FA via authenticator app
**And** a QR code is displayed for TOTP setup
**And** they must enter a valid TOTP code to confirm setup
**And** 8 recovery codes are generated and displayed once

**Given** a user with 2FA configured
**When** they complete Google OAuth
**Then** they are prompted for their TOTP code
**And** upon valid code entry, they receive a JWT token
**And** the JWT contains: user_id, tenant_id, role, permissions

**Given** a user enters incorrect TOTP code
**When** they fail 5 consecutive times
**Then** the account is temporarily locked for 15 minutes
**And** an email notification is sent to the user

**Technical Notes:**
- Integrate Auth0 for OAuth and 2FA management
- JWT expiry: 15 minutes access token, 7 days refresh token
- Store recovery codes hashed (bcrypt)

---

### Story 1.7: Team Member Invitation

As a **Tenant Owner**,
I want to invite team members via email with department and role assignment,
So that my team can access our Mentor AI workspace.

**Acceptance Criteria:**

**Given** a Tenant Owner on the team management page
**When** they click "Invite Member" and enter:
- Email address (required, valid format)
- Department (dropdown: Finance, Marketing, Technology, Operations, Legal, Creative)
- Role (Team Member - only role available for invites)
**Then** an invitation email is sent with a unique invite link
**And** the invite link expires after 7 days
**And** the pending invitation appears in the team list

**Given** an invited user clicks the invitation link
**When** the link is valid and not expired
**Then** they are directed to complete registration (if new) or login (if existing)
**And** upon authentication, they are added to the tenant as Team Member
**And** their department assignment is applied

**Given** an invitation link
**When** it has expired or been revoked
**Then** display error: "This invitation has expired. Please request a new invite."

**Given** the tenant has reached its user limit (based on subscription)
**When** the Tenant Owner tries to invite another member
**Then** display error: "User limit reached. Upgrade your plan to add more team members."

**Technical Notes:**
- Create Invitation entity (inv_) for tracking invites
- Invitation states: PENDING → ACCEPTED | EXPIRED | REVOKED
- Log all invitation events for audit trail

---

### Story 1.8: Team Member Removal

As a **Tenant Owner**,
I want to remove team members from my workspace,
So that I can manage access when employees leave or roles change.

**Acceptance Criteria:**

**Given** a Tenant Owner viewing the team list
**When** they click "Remove" on a Team Member
**Then** a confirmation modal appears with:
- Member name and email
- Warning about data reassignment
- Option to reassign or archive their data

**Given** the Tenant Owner confirms removal
**When** "Reassign to me" is selected
**Then** the member's notes and saved outputs are transferred to the Owner
**And** the member's conversations are archived (not deleted)
**And** the member loses access immediately
**And** an email notification is sent to the removed member

**Given** the Tenant Owner confirms removal
**When** "Archive data" is selected
**Then** the member's data is archived but retained
**And** the member loses access immediately

**Given** a Tenant Owner tries to remove themselves
**When** they are the only Owner
**Then** display error: "You cannot remove yourself. Designate a backup Owner first."

**Technical Notes:**
- Soft delete user record (retain for audit)
- Implement data reassignment transaction
- Log removal event with reason in audit log

---

### Story 1.9: Backup Owner Designation

As a **Tenant Owner**,
I want to designate a backup Owner for account recovery,
So that the workspace remains accessible if I lose access to my account.

**Acceptance Criteria:**

**Given** a Tenant Owner on account settings
**When** they navigate to "Backup Owner" section
**Then** they see a list of current Team Members eligible for backup designation

**Given** the Tenant Owner selects a Team Member as backup
**When** they confirm the designation
**Then** the selected member receives an email notification
**And** the backup Owner can initiate account recovery if needed
**And** the backup designation is recorded in audit log

**Given** the primary Owner is locked out (failed 2FA, lost access)
**When** the backup Owner initiates recovery
**Then** they must verify via their own 2FA
**And** they can reset the primary Owner's 2FA
**And** an email is sent to the primary Owner notifying of recovery action

**Given** no backup Owner is designated
**When** the tenant has been active for 30+ days
**Then** display a warning banner: "Designate a backup Owner to prevent account lockout"

**Technical Notes:**
- Store backup_owner_id on Tenant entity
- Recovery action requires additional verification
- Log all recovery actions with IP and timestamp

---

### Story 1.10: User Data Export

As a **user**,
I want to export all my data in PDF, Markdown, or JSON format,
So that I have a portable copy of my work for compliance or migration.

**Acceptance Criteria:**

**Given** a user on their profile settings
**When** they click "Export My Data"
**Then** they can select export format: PDF, Markdown, or JSON
**And** they can select data types: Notes, Conversations, Client Profiles, or All

**Given** export is initiated
**When** the export is processing
**Then** a progress indicator shows export status
**And** for large exports, user is notified via email when complete
**And** download link is valid for 24 hours

**Given** export format is JSON
**When** export completes
**Then** data includes:
- User profile information
- All conversations with timestamps
- All saved notes with metadata
- Client/project profiles
**And** format follows a documented schema

**Given** export format is PDF
**When** export completes
**Then** a formatted document is generated with table of contents
**And** conversations are rendered as readable transcripts
**And** notes preserve their section/subsection structure

**Technical Notes:**
- Queue large exports (> 100 items) as background jobs
- Implement rate limiting: 3 exports per day per user
- Encrypt export files at rest, delete after 24 hours

---

### Story 1.11: Tenant Deletion Request

As a **Tenant Owner**,
I want to request full tenant deletion with GDPR-compliant data purge,
So that I can ensure all company data is properly removed from the platform.

**Acceptance Criteria:**

**Given** a Tenant Owner on account settings
**When** they click "Delete Workspace"
**Then** they see a warning explaining:
- All data will be permanently deleted
- All team members will lose access
- This action cannot be undone
- 30-day processing period for GDPR compliance

**Given** the Owner confirms deletion
**When** they re-authenticate via 2FA
**Then** the tenant enters PENDING_DELETION state
**And** all team members receive email notification
**And** a 7-day grace period begins (Owner can cancel)
**And** Owner receives confirmation with deletion timeline

**Given** the grace period ends
**When** deletion proceeds
**Then** tenant state changes to DELETED
**And** all user accounts are deactivated
**And** deletion job is queued for GDPR-compliant purge
**And** completion target is within 30 days of request

**Given** a tenant in PENDING_DELETION state
**When** the Owner clicks "Cancel Deletion"
**Then** the tenant returns to ACTIVE state
**And** team members are notified of cancellation

**Technical Notes:**
- Deletion must cascade across all tenant data
- Generate GDPR deletion certificate upon completion
- Anonymize audit logs instead of deleting (7-year retention)

---

### Story 1.12: LLM Provider Configuration

As a **Platform Owner**,
I want to configure LLM model selection between cloud and local providers,
So that I can optimize cost and performance based on infrastructure needs.

**Acceptance Criteria:**

**Given** a Platform Owner on the admin settings
**When** they navigate to "AI Provider Configuration"
**Then** they see options for:
- Primary provider: OpenRouter (cloud) or Local Llama 3.1
- Fallback provider: Secondary option if primary fails
- Model selection per provider

**Given** OpenRouter is selected as primary
**When** configuration is saved
**Then** API key is validated against OpenRouter
**And** available models are fetched and displayed
**And** cost estimates per 1K tokens are shown

**Given** Local Llama 3.1 is selected
**When** configuration is saved
**Then** local endpoint URL is validated
**And** model availability is confirmed via health check
**And** GPU/CPU resource requirements are displayed

**Given** AI provider configuration changes
**When** the change is saved
**Then** change is logged in audit trail
**And** existing conversations are not affected
**And** new conversations use the updated provider

**Technical Notes:**
- Store provider config in Platform settings (not per-tenant)
- Implement AI Gateway pattern for centralized provider management
- Support hot-switching without restart

---

## Epic 2: AI Conversation & Task Execution

Users can interact with the AI assistant through text and voice to execute business tasks, receiving confidence-scored guidance with concept citations and persistent context memory.

### Story 2.1: Basic Text Conversation Interface

As a **user**,
I want to interact with the AI assistant through a text chat interface,
So that I can request business task execution and receive guidance.

**Acceptance Criteria:**

**Given** an authenticated user on the main dashboard
**When** they navigate to "New Conversation"
**Then** a chat interface is displayed with:
- Message input area with send button
- Conversation history panel
- Clear visual distinction between user and AI messages
**And** the interface follows dark mode design (#0A0A0A background)

**Given** a user types a message and clicks send
**When** the message is submitted
**Then** the message appears in the conversation history immediately
**And** a typing indicator shows while AI processes
**And** the AI response streams in real-time (not all at once)

**Given** a conversation is in progress
**When** the user sends multiple messages
**Then** conversation context is maintained within the session
**And** previous messages are visible with timestamps
**And** the conversation can be scrolled to review history

**Given** a user closes the browser
**When** they return and open the same conversation
**Then** the full conversation history is preserved
**And** they can continue the conversation

**Technical Notes:**
- Create Conversation (sess_) and Message (msg_) entities
- Use WebSocket for real-time streaming responses
- Store messages in tenant database with timestamps
- Implement markdown rendering for AI responses

---

### Story 2.2: AI Gateway Service with Streaming

As a **system**,
I want a centralized AI Gateway service handling all LLM requests,
So that I can manage rate limiting, cost tracking, and provider failover.

**Acceptance Criteria:**

**Given** a conversation request is initiated
**When** the AI Gateway receives the request
**Then** it validates the request against rate limits
**And** routes to the configured LLM provider
**And** tracks token consumption per user/tenant
**And** returns a streaming response via WebSocket

**Given** the primary LLM provider fails
**When** the request times out (> 30 seconds) or returns error
**Then** the Gateway automatically retries with fallback provider
**And** the failover is logged for monitoring
**And** the user experience is uninterrupted

**Given** a tenant exceeds their token quota
**When** they attempt a new conversation
**Then** a clear error message is returned: "Token limit reached"
**And** the request is not sent to the LLM provider
**And** upgrade options are presented

**Given** multiple concurrent requests from a tenant
**When** rate limits are approached
**Then** requests are queued with priority (Owner > Team Member)
**And** queue position is communicated to the user
**And** requests timeout after 2 minutes in queue

**Given** the system is under load
**When** 100 concurrent users send requests
**Then** P95 response time remains < 2 seconds
**And** no requests are dropped (queued if necessary)
**And** circuit breaker activates only after 5 consecutive failures

**Technical Notes:**
- Implement circuit breaker pattern (open after 5 failures)
- Use Upstash Redis for rate limiting and queue management
- Track costs per request using provider pricing APIs
- Log all requests with correlation IDs for debugging
- Load testing target: 100 concurrent users, < 2s P95

---

### Story 2.3: Sub-5-Minute First Value Quick Win

As a **new user completing onboarding**,
I want to experience immediate AI value within 5 minutes,
So that I understand the platform's capabilities and see ROI quickly.

**Acceptance Criteria:**

**Given** a user completes registration and authentication
**When** they reach the onboarding flow
**Then** they see a 3-step wizard:
1. Account setup (completed)
2. Business context (company details from registration)
3. First task (guided quick win)

**Given** the user reaches "First Task" step
**When** they are presented with quick win options
**Then** they see 3-4 pre-configured task templates based on their industry:
- "Draft a professional email response"
- "Create a meeting agenda"
- "Summarize key points from text"
- "Generate a project brief outline"

**Given** the user selects a quick win task
**When** they provide minimal input (1-2 fields)
**Then** the AI generates a useful output within 30 seconds
**And** a timer shows "Time to first value: X seconds"
**And** the output demonstrates professional quality

**Given** the quick win completes successfully
**When** the user reviews the output
**Then** they can save it as their first note
**And** they see a celebration message: "You just saved ~15 minutes!"
**And** their tenant state transitions from ONBOARDING to ACTIVE

**Technical Notes:**
- Pre-warm LLM context for quick win tasks
- Track time-to-first-value metric per user
- Industry-specific templates stored in knowledge base
- Target: 90% of users complete first task within 5 minutes (PR1)

---

### Story 2.4: Department Persona Task Execution

As a **user**,
I want the AI to execute tasks using department-specific personas,
So that I receive guidance tailored to different business functions.

**Acceptance Criteria:**

**Given** a user starts a new conversation
**When** they select a department persona
**Then** they can choose from: CFO, CMO, CTO, Operations, Legal, Creative
**And** each persona has a distinct visual avatar/icon
**And** the persona name appears in the conversation header

**Given** a CFO persona is selected
**When** the user asks for financial guidance
**Then** the AI responds with financial expertise, metrics focus, and ROI considerations
**And** responses reference relevant financial concepts from the knowledge base

**Given** a CMO persona is selected
**When** the user asks for marketing guidance
**Then** the AI responds with marketing expertise, brand considerations, and growth strategies
**And** responses reference relevant marketing concepts from the knowledge base

**Given** a user switches personas mid-conversation
**When** they select a different department
**Then** the conversation context is maintained
**And** the AI acknowledges the persona switch
**And** subsequent responses reflect the new persona's expertise

**Given** any department persona is active
**When** generating task outputs
**Then** the response includes the persona identifier
**And** the tone and terminology match the department domain

**Technical Notes:**
- Create Persona (prs_) entity with system prompts per department
- Store persona selection per conversation
- Persona prompts should be ~500 tokens each (efficient)
- Visual avatars follow UX design specification

---

### Story 2.5: Confidence Scores on AI Outputs

As a **user**,
I want to see confidence scores on AI-generated guidance,
So that I can assess the reliability of recommendations.

**Acceptance Criteria:**

**Given** the AI generates a response
**When** the response is displayed
**Then** a confidence indicator appears (0-100% or Low/Medium/High)
**And** the indicator uses visual color coding:
- High (80-100%): Green
- Medium (50-79%): Yellow
- Low (0-49%): Orange

**Given** a response has low confidence
**When** the user hovers over the indicator
**Then** a tooltip explains: "This guidance is based on limited context. Consider providing more details."

**Given** a response includes multiple recommendations
**When** each recommendation is distinct
**Then** each can have its own confidence score
**And** overall response confidence is the weighted average

**Given** a user provides feedback that a response was incorrect
**When** confidence was high but output was wrong
**Then** the feedback is logged for model calibration
**And** future similar queries may show adjusted confidence

**Technical Notes:**
- Extract confidence from LLM logprobs where available
- Fallback: Use heuristic based on response hedging language
- Store confidence scores with messages for analytics
- Display follows UX confidence indicator specification

---

### Story 2.6: Business Concept Citations

As a **user**,
I want AI responses to cite specific business concepts,
So that I can learn and explore the underlying frameworks.

**Acceptance Criteria:**

**Given** the AI generates a response
**When** the response references a business concept from the knowledge base
**Then** the concept name appears as a clickable link/badge
**And** multiple concepts can be cited in a single response

**Given** a user clicks a concept citation
**When** the concept exists in the knowledge base
**Then** a side panel opens showing:
- Concept name and category
- Brief definition (2-3 sentences)
- "Learn More" link to full concept page

**Given** a response is generated
**When** concepts are cited
**Then** citations appear inline with the text (not just at the end)
**And** the visual style distinguishes concepts from regular links
**And** up to 5 concepts are cited per response (avoid overwhelming)

**Given** no relevant concepts apply
**When** the AI generates a response
**Then** no concept citations are shown
**And** the response is still complete and useful

**Technical Notes:**
- Create ConceptCitation (cit_) entity linking messages to concepts
- Use semantic search to identify relevant concepts during generation
- Cache concept embeddings in Qdrant for fast lookup
- Track concept citation analytics for engagement (FR21)

---

### Story 2.7: Persistent Memory Across Conversations

As a **user**,
I want the AI to remember context from previous conversations,
So that I don't have to repeat information about my clients and projects.

**Acceptance Criteria:**

**Given** a user has completed previous conversations
**When** they start a new conversation
**Then** the AI has access to relevant context from past interactions
**And** the AI proactively references relevant past context when applicable

**Given** a user mentions a client by name
**When** that client has been discussed before
**Then** the AI recalls: client industry, previous projects, constraints mentioned
**And** applies this context without the user needing to repeat it

**Given** the AI references past context
**When** displaying this in the conversation
**Then** it's clearly indicated: "Based on our previous discussion about [X]..."
**And** the user can correct outdated information

**Given** a user wants to clear memory
**When** they click "Forget this context"
**Then** specific memories can be selectively deleted
**And** the deletion is confirmed with the user

**Given** memory retrieval occurs
**When** context is pulled from previous conversations
**Then** the retrieval time is < 500ms
**And** only relevant context is included (not entire conversation history)

**Technical Notes:**
- Store memory embeddings in Qdrant per user/tenant
- Implement RAG (Retrieval Augmented Generation) pattern
- Memory entries: user statements, client mentions, preferences
- Respect tenant isolation - memories never cross tenants

---

### Story 2.8: User Feedback on AI Outputs

As a **user**,
I want to provide feedback on AI outputs,
So that the system can improve future responses.

**Acceptance Criteria:**

**Given** an AI response is displayed
**When** the user views it
**Then** feedback buttons appear: 👍 (helpful) / 👎 (not helpful)
**And** an optional "Provide details" link is available

**Given** the user clicks 👎 (not helpful)
**When** prompted for details
**Then** they can select from:
- "Inaccurate information"
- "Not relevant to my question"
- "Too generic"
- "Missing important details"
- "Other" (with text input)

**Given** feedback is submitted
**When** saved to the system
**Then** a brief "Thank you" confirmation appears
**And** the feedback is associated with the specific message
**And** feedback does not interrupt the conversation flow

**Given** a user provides a correction
**When** they edit the AI's response
**Then** the correction is saved as preferred output
**And** similar future queries consider this correction
**And** the original response is retained for comparison

**Given** aggregate feedback data exists
**When** reviewed by the system
**Then** common issues are identified for prompt improvement
**And** feedback trends are visible in platform analytics

**Technical Notes:**
- Create Feedback entity linking to messages
- Store feedback for RLHF-style improvements
- Feedback analysis runs as async batch job
- Never share individual feedback across tenants

---

### Story 2.9: Department Guardrails

As a **system**,
I want to enforce department guardrails preventing cross-functional data leakage,
So that sensitive information stays within appropriate boundaries.

**Acceptance Criteria:**

**Given** a user is assigned to the Finance department
**When** they make a request
**Then** they can only access Finance-related data and concepts
**And** requests for Marketing-specific data are blocked

**Given** a guardrail violation is attempted
**When** a user requests data outside their department
**Then** a clear message is shown: "This information is restricted to [Department] team members"
**And** the attempt is logged in the audit trail

**Given** department guardrails are configured by the Tenant Owner
**When** they set up restrictions
**Then** they can specify which departments can access which data types
**And** guardrails apply to all team members (not Owners)

**Given** an AI response would include cross-department data
**When** guardrails are active
**Then** the sensitive portion is redacted or omitted
**And** the response indicates: "Some information was filtered based on your access level"

**Given** a Tenant Owner reviews guardrail enforcement
**When** they view the audit log
**Then** they can see all guardrail triggers without seeing the blocked content
**And** patterns of inappropriate access attempts are highlighted

**Technical Notes:**
- Implement guardrail checks in AI Gateway middleware
- Use department tags on all data entities
- Guardrail configuration stored per tenant
- Performance: guardrail check must add < 50ms to response time

---

### Story 2.10: Unified Business Partner Mode

As a **user**,
I want to disable department persona switching and use a unified mode,
So that I can get holistic business guidance without switching contexts.

**Acceptance Criteria:**

**Given** a user prefers unified mode
**When** they access conversation settings
**Then** they can toggle "Unified Business Partner" mode on/off
**And** the setting persists across sessions

**Given** unified mode is enabled
**When** the user starts a conversation
**Then** no persona selection is shown
**And** the AI responds as a general "Business Partner"
**And** the AI draws from all department knowledge bases

**Given** unified mode is active
**When** the user asks questions spanning multiple domains
**Then** the AI provides integrated guidance
**And** responses may reference concepts from multiple departments
**And** confidence scores reflect cross-domain complexity

**Given** unified mode is enabled
**When** department guardrails are also configured
**Then** guardrails still apply (unified mode doesn't bypass security)
**And** the user only sees data they're authorized for

**Given** a Tenant Owner
**When** they review team settings
**Then** they can see which users have unified mode enabled
**And** they can set unified mode as the default for new users

**Technical Notes:**
- Store unified_mode preference on User entity
- Unified persona uses combined system prompt
- Track usage analytics: persona mode vs unified mode
- Unified mode may have slightly higher token usage

---

### Story 2.11: Recursive Workflow Detection

As a **system**,
I want to detect and prevent recursive or infinite loop workflows,
So that system resources are protected and users don't get stuck.

**Acceptance Criteria:**

**Given** the AI is executing a task
**When** it generates a sub-task that triggers itself
**Then** the recursion is detected within 3 iterations
**And** execution is halted with error: "Circular workflow detected"

**Given** a workflow chain exceeds depth limit
**When** 10 nested operations are reached
**Then** further nesting is blocked
**And** user is prompted: "This workflow is complex. Would you like to simplify?"

**Given** recursion is detected
**When** the error is shown
**Then** the partial results (if any) are preserved
**And** the user can review what was completed
**And** suggestions for breaking the loop are provided

**Given** a legitimate deep workflow
**When** it approaches the depth limit
**Then** a warning is shown at depth 7: "This workflow is getting complex"
**And** the user can choose to continue or restructure

**Given** workflow metrics are tracked
**When** recursion events occur
**Then** they are logged with stack trace for debugging
**And** patterns are analyzed to improve detection

**Technical Notes:**
- Implement workflow depth tracking in AI Gateway
- Use hash of workflow state to detect true loops
- Set hard limit: 10 depth, 50 total operations per request
- Log recursion events to Sentry for analysis

---

### Story 2.12: Voice Commands (STT/TTS)

As a **user**,
I want to interact with the AI using voice commands,
So that I can work hands-free and communicate naturally.

**Acceptance Criteria:**

**Given** a user is in a conversation
**When** they click the microphone button
**Then** voice recording begins with visual indicator
**And** real-time transcription appears as they speak
**And** STT latency is ≤ 3 seconds (P95) per PR3

**Given** the user stops speaking
**When** silence is detected for 2 seconds
**Then** recording automatically stops
**And** the transcribed text is submitted as their message
**And** they can edit before final submission

**Given** an AI response is received
**When** TTS is enabled
**Then** the response is read aloud automatically
**And** TTS time-to-first-byte is ≤ 500ms per PR3
**And** a visual indicator shows audio playback progress

**Given** TTS is playing
**When** the user clicks stop or starts speaking
**Then** audio playback immediately stops
**And** the conversation continues normally

**Given** voice features are accessed
**When** browser permissions are required
**Then** a clear prompt explains why microphone access is needed
**And** users can deny and continue with text-only mode
**And** permission preference is remembered

**Given** ambient noise is high
**When** STT struggles to transcribe
**Then** confidence indicators show uncertain words
**And** the user can tap to correct transcription
**And** voice recognition accuracy targets 95% (UX6)

**Technical Notes:**
- Integrate Whisper for STT (real-time streaming)
- Integrate Azure TTS for text-to-speech
- Store voice preference per user
- Support noise cancellation where available
- Fallback gracefully if voice services unavailable

---

## Epic 3: Knowledge Base & Business Concepts

Users can access and explore 600 proprietary business concepts with graph visualization, upload Business Brain documents, and benefit from AI-powered concept recommendations.

### Story 3.1: Business Concepts Data Model & Seeding

As a **platform administrator**,
I want the 600 business concepts loaded into the system with proper categorization,
So that users and AI can reference structured business knowledge.

**Acceptance Criteria:**

**Given** the platform database is initialized
**When** the concept seeding runs
**Then** 600 business concepts are imported with:
- Unique ID (cpt_ prefix)
- Name and category (Finance, Marketing, Technology, Operations, Legal, Creative)
- Definition (2-3 sentences)
- Extended description (full explanation)
- Related concepts (links to other concept IDs)
- Department tags for filtering

**Given** concepts are loaded
**When** queried by category
**Then** concepts are returned grouped by business function
**And** query response time is < 100ms

**Given** a concept has related concepts
**When** the relationship is stored
**Then** bidirectional links are maintained
**And** relationship types are categorized (prerequisite, related, advanced)

**Given** the concept library needs updating
**When** new concepts are added or existing ones modified
**Then** changes can be applied via migration scripts
**And** version history is maintained

**Technical Notes:**
- Create Concept (cpt_) entity in platform database (shared across tenants)
- Generate embeddings for each concept using configured LLM (1536 dimensions for OpenAI compatibility)
- Store embeddings in Qdrant for semantic search with cosine similarity
- Concept data loaded from structured JSON/YAML seed files
- Support re-embedding if model changes (versioned embeddings)

---

### Story 3.2: Concept Browse and Search Interface

As a **user**,
I want to browse and search the business concepts library,
So that I can discover relevant frameworks and methodologies.

**Acceptance Criteria:**

**Given** a user navigates to the Knowledge Base
**When** the page loads
**Then** they see:
- Category filters (Finance, Marketing, Technology, etc.)
- Search input with autocomplete
- Featured/popular concepts section
- Recently viewed concepts (personalized)

**Given** a user types in the search box
**When** they enter 3+ characters
**Then** autocomplete suggestions appear within 200ms
**And** suggestions include concept name and category
**And** results are ranked by relevance

**Given** a user selects a category filter
**When** the filter is applied
**Then** only concepts in that category are displayed
**And** multiple category filters can be combined
**And** active filters are clearly visible with remove option

**Given** search results are displayed
**When** the user views them
**Then** each result shows: name, category badge, brief definition
**And** results are paginated (20 per page)
**And** total count is displayed

**Technical Notes:**
- Use Qdrant hybrid search (vector + BM25) for relevance
- Cache popular searches in Redis
- Track search queries for analytics (anonymized)
- Implement debounced search (300ms delay)

---

### Story 3.3: Concept Detail Pages

As a **user**,
I want to view detailed concept pages with full explanations,
So that I can deeply understand business frameworks and methodologies.

**Acceptance Criteria:**

**Given** a user clicks on a concept
**When** the detail page loads
**Then** they see:
- Concept name and category
- Full definition and explanation
- Practical examples and use cases
- Related concepts with clickable links
- "Ask AI about this concept" button

**Given** the concept has related concepts
**When** viewing the detail page
**Then** related concepts appear as cards
**And** clicking a related concept navigates to its detail page
**And** breadcrumb navigation shows the viewing path

**Given** a user clicks "Ask AI about this concept"
**When** a new conversation starts
**Then** the concept context is automatically included
**And** the AI is primed to discuss applications of this concept
**And** the conversation references the concept in citations

**Given** concept pages are accessed
**When** the page renders
**Then** load time is < 2 seconds
**And** the page is fully accessible (keyboard nav, screen reader)
**And** content is formatted with clear typography

**Technical Notes:**
- Implement concept detail as Angular route with resolver
- Pre-fetch related concepts for faster navigation
- Use Angular Signals for reactive state updates
- Support deep linking to specific concepts

---

### Story 3.4: Knowledge Graph Visualization

As a **user**,
I want to visualize concept relationships as an interactive graph,
So that I can explore connections between business frameworks.

**Acceptance Criteria:**

**Given** a user accesses the Knowledge Graph view
**When** the visualization loads
**Then** concepts appear as nodes with category-based colors
**And** relationships appear as connecting edges
**And** the graph renders at 60fps (WebGL)

**Given** the graph is displayed
**When** the user interacts with it
**Then** they can:
- Pan and zoom with mouse/touch
- Click nodes to highlight connections
- Double-click to navigate to concept detail
- Filter by category to reduce visual complexity

**Given** a specific concept is selected
**When** it's highlighted in the graph
**Then** its direct connections are emphasized
**And** secondary connections are dimmed
**And** a side panel shows the concept preview

**Given** the full graph would be overwhelming (600 nodes)
**When** initially displayed
**Then** a focused view shows top 50 most-connected concepts
**And** users can expand to see more
**And** search allows jumping to specific concepts in the graph

**Given** performance requirements
**When** rendering the graph
**Then** initial load is < 3 seconds
**And** interactions remain smooth with 600 nodes visible
**And** memory usage stays under 100MB

**Technical Notes:**
- Use Sigma.js with WebGL renderer per UX specification
- Implement force-directed layout algorithm
- Cache graph layout to avoid recalculation
- Lazy-load node details on hover/click

---

### Story 3.5: Concept Engagement Tracking

As a **platform administrator**,
I want to track which concepts users engage with,
So that I can understand knowledge gaps and improve content.

**Acceptance Criteria:**

**Given** a user views a concept detail page
**When** they spend more than 5 seconds on it
**Then** a view event is recorded with:
- User ID (anonymized for aggregate)
- Concept ID
- Timestamp
- Time spent on page

**Given** a user clicks "Ask AI about this concept"
**When** the conversation starts
**Then** an engagement event is recorded
**And** the event links concept to conversation

**Given** concept citations appear in AI responses
**When** a user clicks on a citation
**Then** a citation-click event is recorded
**And** the path from conversation to concept is tracked

**Given** engagement data is collected
**When** an admin views analytics
**Then** they can see:
- Most viewed concepts (by category)
- Concept view trends over time
- Correlation between concept views and task completion
- Least engaged concepts (potential content issues)

**Given** privacy requirements
**When** engagement data is stored
**Then** individual user behavior is not identifiable in reports
**And** data is aggregated at tenant level minimum
**And** users can opt out of detailed tracking

**Technical Notes:**
- Create ConceptEngagement entity for event tracking
- Use Upstash Redis for real-time counting
- Batch write events to database every 5 minutes
- Implement anonymization for cross-tenant analytics

---

### Story 3.6: Business Brain PDF Upload

As a **Tenant Owner**,
I want to upload Business Brain documents (PDFs with Obsidian notes),
So that I can define company-specific knowledge and guardrails.

**Acceptance Criteria:**

**Given** a Tenant Owner accesses Business Brain settings
**When** they click "Upload Business Brain"
**Then** they can select a PDF file (max 50MB)
**And** supported formats are clearly indicated
**And** upload progress is displayed

**Given** a PDF is uploaded
**When** processing begins
**Then** the document is queued for extraction
**And** status shows: "Processing... Extracting content"
**And** estimated completion time is displayed

**Given** PDF processing completes
**When** content is extracted
**Then** text content is parsed and indexed
**And** Obsidian-style links ([[concept]]) are recognized
**And** sections are identified and categorized
**And** a preview of extracted content is shown for review

**Given** extraction is reviewed
**When** the Tenant Owner approves
**Then** the Business Brain becomes active for their tenant
**And** AI responses incorporate this company-specific knowledge
**And** the upload is recorded in audit log

**Given** an upload fails
**When** the error occurs
**Then** a clear error message explains the issue
**And** the user can retry or upload a different file
**And** partial content is not saved

**Technical Notes:**
- Use pdf-parse or similar for text extraction
- Store raw PDF in cloud storage (S3/GCS)
- Store extracted content in tenant database
- Generate embeddings for semantic retrieval
- Maximum 1 active Business Brain per tenant

---

### Story 3.7: PDF Sanitization & Security

As a **system**,
I want to sanitize uploaded Business Brain PDFs,
So that malicious content cannot compromise the platform.

**Acceptance Criteria:**

**Given** a PDF is uploaded
**When** processing begins
**Then** the following security checks run:
- File type validation (magic bytes, not just extension)
- Executable content detection and stripping
- JavaScript removal from PDF
- Embedded file extraction and scanning
- Size and page count validation

**Given** prompt injection patterns are detected
**When** scanning the extracted text
**Then** suspicious patterns are flagged:
- "Ignore previous instructions"
- System prompt override attempts
- Role confusion attacks
- Data exfiltration patterns
**And** flagged content is quarantined for review

**Given** security checks fail
**When** threats are detected
**Then** the upload is rejected with generic error (no details that help attackers)
**And** the attempt is logged with full details for security review
**And** Tenant Owner is notified of rejection

**Given** security checks pass
**When** content is deemed safe
**Then** a security score is assigned
**And** the content proceeds to indexing
**And** a sanitization certificate is generated

**Given** ongoing security monitoring
**When** new threat patterns are identified
**Then** existing Business Brains can be re-scanned
**And** admins are alerted to potential issues

**Technical Notes:**
- Implement PDF sanitization in isolated sandbox
- Use regex patterns for prompt injection detection
- Log all security events to immutable audit log
- 100% sanitization rate per SC5 requirement

---

### Story 3.8: Business Brain Versioning

As a **Tenant Owner**,
I want version control for Business Brain uploads,
So that I can rollback to previous versions if needed.

**Acceptance Criteria:**

**Given** a Business Brain is already active
**When** a new version is uploaded
**Then** the previous version is archived (not deleted)
**And** the new version becomes active
**And** version number increments automatically

**Given** the Tenant Owner views Business Brain settings
**When** they check version history
**Then** they see:
- All previous versions with upload dates
- Who uploaded each version
- Active/archived status
- Size and page count per version

**Given** a Tenant Owner wants to rollback
**When** they select a previous version
**Then** a confirmation dialog explains the impact
**And** upon confirmation, the selected version becomes active
**And** the current version is archived
**And** AI responses immediately use the restored version

**Given** storage limits apply
**When** more than 5 versions exist
**Then** versions older than 90 days can be permanently deleted
**And** at least 3 versions are always retained
**And** deletion requires explicit confirmation

**Given** version changes occur
**When** the change is made
**Then** all version events are logged in audit trail
**And** the AI cache is invalidated for this tenant

**Technical Notes:**
- Store versions with naming: businessbrain_v{N}_{timestamp}.pdf
- Keep embeddings for each version (allow quick rollback)
- Version metadata stored in tenant database
- Implement soft delete with 30-day recovery window

---

### Story 3.9: Sensitive Data Filtering in AI Outputs

As a **system**,
I want to filter AI outputs to prevent sensitive data leakage,
So that confidential information doesn't appear where it shouldn't.

**Acceptance Criteria:**

**Given** AI generates a response
**When** the response includes potential sensitive data
**Then** the following are detected and filtered:
- PII (names, emails, phone numbers from Business Brain)
- Financial figures marked as confidential
- Internal project codenames
- Department-restricted information

**Given** a user's department doesn't have access
**When** sensitive content would be included
**Then** the content is redacted: "[Restricted: Finance only]"
**And** the response still provides value without the sensitive details
**And** the redaction event is logged

**Given** sensitive data patterns are configured
**When** a Tenant Owner sets up filters
**Then** they can define:
- Custom regex patterns for sensitive data
- Department-level access rules
- Keyword blocklists
- Whitelisted terms that should never be filtered

**Given** filtering is applied
**When** the response is generated
**Then** filtering adds < 100ms to response time
**And** false positives can be reported and corrected
**And** filtering decisions are logged for audit

**Given** a user reports incorrect filtering
**When** they flag a false positive
**Then** the feedback is recorded
**And** patterns can be adjusted by Tenant Owner
**And** the specific instance can be manually approved

**Technical Notes:**
- Implement filtering as post-processing step in AI Gateway
- Use NER (Named Entity Recognition) for PII detection
- Cache filter patterns in Redis for performance
- Log all filtering events with redacted content hash

---

## Epic 4: Client & Project Context Management

Users can create and manage client profiles and projects, with AI automatically applying relevant context to task execution and organizing outputs as searchable notes.

### Story 4.1: Client Profile Creation & Management

As a **user**,
I want to create and manage client profiles with contextual information,
So that the AI can provide personalized guidance for each client relationship.

**Acceptance Criteria:**

**Given** a user navigates to "Clients" section
**When** they click "Add Client"
**Then** they can enter:
- Client name (required, 2-100 characters)
- Industry (dropdown selection)
- Company size (dropdown: Startup, SMB, Enterprise)
- Key constraints (text area, max 1000 characters)
- Preferences (tags: communication style, priorities)
- Logo/avatar (optional, max 1MB)

**Given** a client profile is created
**When** saved successfully
**Then** the client appears in the client list
**And** a unique ID is assigned (cli_ prefix)
**And** creation is logged in audit trail

**Given** an existing client profile
**When** the user clicks "Edit"
**Then** all fields can be modified
**And** change history is preserved
**And** last modified timestamp is updated

**Given** a user wants to archive a client
**When** they click "Archive"
**Then** the client is hidden from active list
**And** associated data is retained
**And** the client can be restored later

**Given** the client list grows large
**When** viewing all clients
**Then** clients can be filtered by industry, size, or status
**And** search by name is supported
**And** clients are paginated (20 per page)

**Technical Notes:**
- Create Client (cli_) entity in tenant database
- Store client context as structured JSON for AI retrieval
- Index client name and industry for search
- Implement soft delete for archiving

---

### Story 4.2: Project Profile Creation

As a **user**,
I want to create project profiles associated with clients,
So that I can track work context and deliverables per engagement.

**Acceptance Criteria:**

**Given** a user is viewing a client profile
**When** they click "Add Project"
**Then** they can enter:
- Project name (required, 2-100 characters)
- Client association (pre-filled if started from client view)
- Project type (dropdown: Consulting, Implementation, Support, etc.)
- Start date and target end date
- Project goals (text area, max 2000 characters)
- Key stakeholders (list of names/roles)
- Status (Active, On Hold, Completed)

**Given** a project is created
**When** saved successfully
**Then** the project appears under its associated client
**And** a unique ID is assigned (prj_ prefix)
**And** the project is available for conversation context

**Given** a project exists
**When** viewing the project detail
**Then** all associated conversations are listed
**And** all saved notes are displayed
**And** a timeline shows project activity

**Given** a project is marked complete
**When** the status changes
**Then** the project moves to "Completed" section
**And** associated data remains accessible
**And** no new conversations can be started (but existing ones continue)

**Given** a user needs to find projects
**When** searching or filtering
**Then** projects can be found by name, client, or status
**And** recently accessed projects appear first
**And** cross-client project search is supported

**Technical Notes:**
- Create Project (prj_) entity linked to Client
- Store project context for AI retrieval
- Implement project-conversation many-to-many relationship
- Allow conversations to span multiple projects

---

### Story 4.3: Auto-Apply Client/Project Context

As a **user**,
I want the AI to automatically apply client and project context,
So that I don't have to repeatedly explain the situation.

**Acceptance Criteria:**

**Given** a user starts a new conversation
**When** they select a client and/or project
**Then** the relevant context is automatically loaded
**And** the AI acknowledges: "I see we're working on [Project] for [Client]"
**And** the context influences all subsequent responses

**Given** client context is loaded
**When** the AI generates responses
**Then** it considers:
- Client industry and constraints
- Previous conversations about this client
- Saved notes related to this client
- Client preferences and communication style

**Given** project context is loaded
**When** the AI generates responses
**Then** it considers:
- Project goals and current status
- Key stakeholders mentioned
- Previous project-related conversations
- Project timeline and deadlines

**Given** the user mentions a client name mid-conversation
**When** the name matches an existing client profile
**Then** the AI offers: "Would you like me to apply [Client Name]'s context?"
**And** the user can confirm or decline
**And** if confirmed, context is loaded seamlessly

**Given** context is applied
**When** viewing the conversation
**Then** a badge shows which client/project context is active
**And** the user can switch or remove context mid-conversation
**And** context changes are noted in the conversation history

**Technical Notes:**
- Implement context injection in AI prompt construction
- Use RAG to retrieve relevant previous conversations
- Context loading must add < 500ms to response time
- Store context association with each conversation

---

### Story 4.4: Save Task Outputs as Structured Notes

As a **user**,
I want to save AI task outputs as structured notes,
So that I can organize and reference my work later.

**Acceptance Criteria:**

**Given** an AI response contains useful output
**When** the user clicks "Save as Note"
**Then** a dialog appears with:
- Note title (pre-filled from AI output summary)
- Section (dropdown or create new)
- Subsection (dropdown or create new)
- Associated client/project (pre-filled from conversation context)
- Tags (optional, autocomplete from existing tags)

**Given** note structure is defined
**When** the user confirms save
**Then** the note is created with format: Section/Subsection/Task Name
**And** the full AI output is preserved
**And** metadata includes: timestamp, conversation link, user who saved

**Given** a user creates a new section
**When** entering the section name
**Then** the section is created in the user's note hierarchy
**And** future notes can be organized under this section
**And** sections can be reordered via drag-and-drop

**Given** a note is saved
**When** viewing the note later
**Then** the original conversation can be accessed via link
**And** the note shows: title, content, metadata, related notes
**And** the note can be exported independently

**Given** the user saves frequently
**When** viewing recent notes
**Then** a "Quick Save" option remembers last used section/subsection
**And** notes can be saved with one click using defaults

**Technical Notes:**
- Create Note (note_) entity with hierarchical structure
- Store notes in tenant database with full-text indexing
- Link notes to conversations and client/project
- Support markdown formatting in note content

---

### Story 4.5: Search Notes Within Workspace

As a **user**,
I want to search all my saved notes,
So that I can quickly find previous work and insights.

**Acceptance Criteria:**

**Given** a user accesses the Notes section
**When** they type in the search box
**Then** search queries across:
- Note titles
- Note content
- Tags
- Client/project names
**And** results appear within 500ms

**Given** search results are displayed
**When** viewing them
**Then** each result shows:
- Note title with search term highlighted
- Preview snippet with matching text
- Section path (Section > Subsection)
- Client/project association
- Date created

**Given** the user wants to filter results
**When** they apply filters
**Then** they can narrow by:
- Date range
- Client or project
- Section/subsection
- Tags
**And** filters can be combined
**And** active filters are clearly visible

**Given** no results are found
**When** the search completes
**Then** a helpful message appears: "No notes found. Try different keywords."
**And** suggestions for related searches are offered
**And** option to search in conversations is presented

**Given** search is performed frequently
**When** viewing search history
**Then** recent searches are saved
**And** users can clear search history
**And** popular searches are not tracked across users

**Technical Notes:**
- Implement full-text search with PostgreSQL tsvector
- Add search analytics (anonymized) for improving results
- Cache recent search results in Redis
- Search response time target: < 500ms (PR5)

---

### Story 4.6: Edit Saved Notes

As a **user**,
I want to edit my saved notes,
So that I can update, refine, and correct my documented work.

**Acceptance Criteria:**

**Given** a user views a saved note
**When** they click "Edit"
**Then** a rich text editor opens with:
- Markdown support (headers, lists, code blocks)
- Formatting toolbar
- Preview mode toggle
- Auto-save indicator

**Given** the user modifies note content
**When** changes are made
**Then** auto-save triggers every 30 seconds
**And** a "Saving..." indicator appears briefly
**And** unsaved changes show a warning before leaving

**Given** a note is being edited
**When** the user wants to update metadata
**Then** they can change:
- Note title
- Section/subsection location
- Client/project association
- Tags
**And** the original creation date is preserved

**Given** edit history is important
**When** viewing a note
**Then** version history is accessible
**And** previous versions can be previewed
**And** the user can restore a previous version

**Given** a note should be deleted
**When** the user clicks "Delete"
**Then** a confirmation dialog appears
**And** deleted notes go to trash (30-day retention)
**And** notes can be restored from trash

**Technical Notes:**
- Implement optimistic locking for concurrent edit prevention
- Store version history (last 10 versions per note)
- Use debounced auto-save to prevent excessive writes
- Support markdown preview rendering

---

### Story 4.7: Filter Notes by Department Guardrails

As a **system**,
I want to filter notes visibility based on department guardrails,
So that team members only see notes appropriate for their role.

**Acceptance Criteria:**

**Given** a user is assigned to a specific department
**When** they view the Notes section
**Then** they only see notes that:
- They created themselves
- Are tagged for their department
- Have no department restriction
**And** restricted notes are hidden (not shown as "restricted")

**Given** a user creates a note
**When** saving the note
**Then** they can optionally set department visibility:
- "My department only"
- "All departments"
- "Specific departments" (multi-select)
**And** default is based on tenant guardrail settings

**Given** a Tenant Owner configures note guardrails
**When** setting up restrictions
**Then** they can define:
- Default visibility for new notes
- Whether users can change visibility
- Cross-department note sharing rules
**And** changes apply to future notes (existing notes unchanged)

**Given** a note references client information
**When** department guardrails are active
**Then** notes about Finance clients are visible only to Finance
**And** notes inheriting client restrictions follow those rules
**And** the user is informed if they can't see related notes

**Given** a user searches notes
**When** results are filtered
**Then** guardrail filtering is applied before results are shown
**And** search doesn't reveal existence of restricted notes
**And** performance impact is < 50ms

**Technical Notes:**
- Add department_visibility field to Note entity
- Implement row-level security in database queries
- Cache guardrail rules per tenant in Redis
- Log all guardrail filtering events for audit

---

## Epic 5: Team Collaboration & Tenant Administration

Tenant Owners can manage team members, view adoption metrics, configure department guardrails, and track ROI through comprehensive dashboards.

### Story 5.1: Team Adoption Dashboard

As a **Tenant Owner**,
I want to view a team adoption dashboard showing tasks completed, time saved, and cost avoided per member,
So that I can understand how my team is using Mentor AI.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to the Admin Dashboard
**When** the Team Adoption section loads
**Then** they see metrics for each team member:
- Total tasks completed (this week/month/all time)
- Estimated time saved (based on task type benchmarks)
- Estimated cost avoided (time saved × hourly rate)
- Last active date
- Most used personas/features

**Given** the dashboard displays team metrics
**When** viewing the overview
**Then** aggregate totals are shown at the top:
- Total team tasks completed
- Total time saved across team
- Total cost avoided
- Team adoption rate (% of members active in last 7 days)

**Given** the Tenant Owner wants detail on a specific member
**When** they click on a team member row
**Then** a detail panel shows:
- Task completion trend (chart)
- Most common task types
- Concept engagement summary
- Note creation activity

**Given** data is displayed
**When** the dashboard loads
**Then** load time is < 2 seconds (PR4)
**And** data refreshes automatically every 5 minutes
**And** manual refresh is available

**Given** privacy considerations
**When** viewing team metrics
**Then** individual conversation content is NOT visible
**And** only aggregate statistics are shown
**And** members are aware their activity is tracked (onboarding disclosure)

**Technical Notes:**
- Create TeamMetrics materialized view for performance
- Calculate time saved using task-type benchmark table
- Cost avoided = time saved × configurable hourly rate (default $150/hr)
- Store aggregate metrics, not individual conversation data

---

### Story 5.2: ROI Calculator

As a **Tenant Owner**,
I want an ROI calculator comparing Mentor AI cost vs consultant costs avoided,
So that I can justify the platform investment to stakeholders.

**Acceptance Criteria:**

**Given** a Tenant Owner accesses the ROI Calculator
**When** the page loads
**Then** they see:
- Current Mentor AI subscription cost (monthly)
- Total tasks completed this period
- Estimated consultant hours equivalent
- Estimated consultant cost if outsourced
- Net savings (consultant cost - subscription)
- ROI percentage

**Given** default calculation assumptions
**When** viewing the ROI
**Then** default values are used:
- Average task = 30 minutes consultant time
- Consultant hourly rate = $250/hour
- Internal employee hourly rate = $75/hour
**And** these defaults can be customized

**Given** the Tenant Owner customizes assumptions
**When** they adjust input values
**Then** the ROI calculation updates in real-time
**And** a comparison chart shows before/after
**And** custom settings can be saved for future reference

**Given** the calculation is complete
**When** the Tenant Owner wants to share results
**Then** they can export to PDF with company branding
**And** the export includes methodology explanation
**And** the export shows data date range

**Given** historical comparison is needed
**When** viewing ROI over time
**Then** a trend chart shows monthly ROI progression
**And** key milestones are highlighted (e.g., "Broke even in Month 2")

**Technical Notes:**
- Store ROI configuration per tenant
- Cache calculation results (recalculate daily)
- PDF export using server-side rendering
- Track ROI export events for engagement analytics

---

### Story 5.3: Department Guardrails Configuration

As a **Tenant Owner**,
I want to configure department guardrails for team members,
So that I can control data access based on organizational structure.

**Acceptance Criteria:**

**Given** a Tenant Owner accesses Guardrails Settings
**When** the configuration page loads
**Then** they see:
- List of departments (Finance, Marketing, Technology, Operations, Legal, Creative)
- Current guardrail rules per department
- Team members assigned to each department
- Toggle to enable/disable guardrails globally

**Given** the Owner configures a guardrail rule
**When** they create a new rule
**Then** they can specify:
- Source department (who is restricted)
- Restricted data types (client data, notes, concepts)
- Target departments (what they can't access)
- Exception users (if any)

**Given** guardrails are configured
**When** a rule is saved
**Then** it takes effect immediately for new requests
**And** existing cached data is invalidated
**And** the change is logged in audit trail

**Given** the Owner wants to test guardrails
**When** they use "Preview as User" feature
**Then** they can see the interface as a specific team member would
**And** they can verify what data is visible/hidden
**And** preview mode is clearly indicated

**Given** complex guardrail scenarios
**When** rules might conflict
**Then** the system shows conflict warnings
**And** more restrictive rules take precedence
**And** rule evaluation order is documented

**Technical Notes:**
- Store guardrail rules as JSON in tenant settings
- Implement rule evaluation engine with caching
- Guardrail check must complete in < 50ms
- Log all guardrail configuration changes

---

### Story 5.4: Team Member Task & Conversation History

As a **Team Member**,
I want to view my own task history and conversation history,
So that I can track my work and revisit previous AI interactions.

**Acceptance Criteria:**

**Given** a Team Member accesses their profile
**When** they navigate to "My Activity"
**Then** they see:
- List of all their conversations (sorted by recent)
- Tasks completed count
- Time saved estimate
- Notes created

**Given** viewing conversation history
**When** the list is displayed
**Then** each conversation shows:
- Title (auto-generated or user-defined)
- Date and duration
- Persona used
- Client/project context (if any)
- Preview of first message

**Given** a Team Member clicks on a conversation
**When** it opens
**Then** the full conversation history is displayed
**And** they can continue the conversation
**And** they can export the conversation

**Given** the history grows large
**When** viewing all conversations
**Then** pagination is available (20 per page)
**And** search by keyword is supported
**And** filter by date range is available

**Given** a Team Member wants to delete a conversation
**When** they click "Delete"
**Then** a confirmation appears
**And** deleted conversations go to trash (30-day retention)
**And** deletion is logged but content is not visible to Tenant Owner

**Technical Notes:**
- Team Members can only see their own data
- Tenant Owners see aggregate metrics, not conversation content
- Implement efficient pagination with cursor-based approach
- Search uses full-text index on conversation content

---

### Story 5.5: Aggregate Team Metrics Dashboard

As a **Tenant Owner**,
I want to view aggregate team metrics without seeing individual conversations,
So that I can monitor overall usage while respecting team privacy.

**Acceptance Criteria:**

**Given** a Tenant Owner accesses the Metrics Dashboard
**When** the page loads
**Then** they see aggregate statistics:
- Total conversations this period
- Average conversations per user
- Most popular personas used
- Peak usage times (heatmap)
- Concept categories most accessed

**Given** the dashboard shows trends
**When** viewing over time
**Then** charts display:
- Weekly/monthly conversation volume trend
- Task completion trend
- Team growth over time
- Feature adoption rates

**Given** metrics are aggregated
**When** drilling down
**Then** the Owner can see:
- Metrics by department (not by individual)
- Metrics by persona (which departments use which)
- Metrics by feature (voice vs text, concepts vs chat)
**And** individual user data is never exposed

**Given** the Owner wants to compare periods
**When** selecting date ranges
**Then** side-by-side comparison is available
**And** percentage change is calculated
**And** anomalies are highlighted

**Given** export is needed
**When** the Owner clicks "Export"
**Then** they can download CSV or PDF
**And** export contains only aggregate data
**And** export is logged in audit trail

**Technical Notes:**
- Pre-aggregate metrics in daily batch job
- Use materialized views for complex aggregations
- Implement differential privacy for small teams (< 5 members)
- Dashboard load time target: < 2 seconds (PR4)

---

### Story 5.6: Visible Value Metrics Tracking

As a **system**,
I want to track visible value metrics demonstrating 10X productivity gains,
So that users and owners can see concrete ROI.

**Acceptance Criteria:**

**Given** a user completes a task
**When** the task is finished
**Then** the system calculates and displays:
- Estimated time saved for this task
- Running total time saved this session
- "You just saved ~X minutes" message

**Given** value metrics are tracked
**When** data is collected
**Then** the following are measured:
- Time-to-first-value for new users (target: < 5 min)
- Average task completion time
- Tasks per user per day
- Repeat usage rate (users returning within 7 days)

**Given** a user views their dashboard
**When** the Value Summary widget loads
**Then** they see:
- Total time saved (lifetime)
- Total tasks completed
- Equivalent cost savings (using default rate)
- "Productivity multiplier" (tasks done / time spent)

**Given** the 10X productivity claim
**When** measuring impact
**Then** benchmarks are established:
- Manual task time (from research/surveys)
- AI-assisted task time (measured)
- Ratio calculated and displayed

**Given** a Tenant Owner views team value
**When** accessing the Value Dashboard
**Then** they see team-wide aggregates
**And** comparison to industry benchmarks
**And** month-over-month improvement

**Technical Notes:**
- Store task timing data for benchmark calculation
- Use industry research for manual task baselines
- Calculate productivity multiplier: (manual time) / (AI time)
- Track NPS correlation with value metrics (UX2)

---

## Epic 6: Integrations & Data Export

Enable users to connect external tools (HubSpot, Google Analytics, Figma) via OAuth and export their data in standard formats (Markdown, JSON, PDF), with monitoring and notifications for integration health.

### Story 6.1: HubSpot OAuth Connection

As a Tenant Owner,
I want to connect my HubSpot account via OAuth,
So that Mentor AI can access my CRM data for context-aware assistance.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to Settings > Integrations
**When** they click "Connect HubSpot"
**Then** they are redirected to HubSpot's OAuth authorization page
**And** the callback URL is properly configured for tenant isolation

**Given** a user completes HubSpot OAuth authorization
**When** HubSpot redirects back with authorization code
**Then** the system exchanges code for access + refresh tokens
**And** tokens are encrypted (AES-256) before storage
**And** tokens are stored in tenant-isolated Integration table (prefix: intg_)

**Given** HubSpot connection is successful
**When** the user returns to Integrations page
**Then** HubSpot shows status "Connected"
**And** displays connected HubSpot account name/email
**And** shows connection timestamp

**Given** OAuth authorization fails or is cancelled
**When** user returns from HubSpot
**Then** appropriate error message is displayed (RFC 7807)
**And** no partial data is stored

**Technical Notes:**
- Create Integration entity: { id (intg_), tenantId, userId, provider, accessToken (encrypted), refreshToken (encrypted), expiresAt, scope, status, connectedAt, lastSyncAt }
- Use Auth0 or dedicated OAuth service for HubSpot flow
- Encrypt tokens with tenant-specific key derived from master key
- Required scopes: contacts, deals, companies (configurable)

---

### Story 6.2: Google Analytics OAuth Connection

As a Tenant Owner,
I want to connect my Google Analytics account via OAuth,
So that Mentor AI can analyze my website metrics for data-driven recommendations.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to Settings > Integrations
**When** they click "Connect Google Analytics"
**Then** they are redirected to Google's OAuth consent screen
**And** requested scopes are displayed clearly

**Given** a user completes Google OAuth authorization
**When** Google redirects back with authorization code
**Then** the system exchanges code for access + refresh tokens
**And** tokens are encrypted (AES-256) before storage
**And** available GA4 properties are fetched and stored

**Given** Google Analytics connection is successful
**When** the user returns to Integrations page
**Then** Google Analytics shows status "Connected"
**And** displays linked properties
**And** user can select which property to use as primary

**Given** OAuth authorization fails or scope is insufficient
**When** user returns from Google
**Then** error specifies which scope was denied
**And** provides guidance on required permissions

**Technical Notes:**
- Use Google OAuth 2.0 with offline_access for refresh tokens
- Required scopes: analytics.readonly
- Store selected GA4 property ID for queries
- Support multiple GA4 properties per connection

---

### Story 6.3: Figma OAuth Connection

As a Tenant Owner,
I want to connect my Figma account via OAuth,
So that Mentor AI can reference my design files in conversations.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to Settings > Integrations
**When** they click "Connect Figma"
**Then** they are redirected to Figma's OAuth authorization page
**And** state parameter prevents CSRF attacks

**Given** a user completes Figma OAuth authorization
**When** Figma redirects back with authorization code
**Then** the system exchanges code for access + refresh tokens
**And** tokens are encrypted (AES-256) before storage
**And** available Figma teams are fetched

**Given** Figma connection is successful
**When** the user returns to Integrations page
**Then** Figma shows status "Connected"
**And** displays connected Figma user name
**And** shows accessible teams/projects

**Given** Figma OAuth returns an error
**When** handling the callback
**Then** error is logged with correlation ID
**And** user sees friendly error message with retry option

**Technical Notes:**
- Figma uses OAuth 2.0 with PKCE recommended
- Tokens have limited lifetime - implement refresh logic
- Store team/project metadata for file browsing
- Required scopes: file_read

---

### Story 6.4: OAuth Token Auto-Refresh

As a system,
I want to automatically refresh OAuth tokens before expiry,
So that integrations remain connected without user intervention.

**Acceptance Criteria:**

**Given** an integration has a refresh token
**When** the access token is within 5 minutes of expiry
**Then** the system proactively refreshes the token
**And** updates encrypted storage with new tokens
**And** logs refresh event (without exposing tokens)

**Given** an API call fails with 401 Unauthorized
**When** the integration has a valid refresh token
**Then** the system attempts token refresh
**And** retries the original request with new token
**And** fails gracefully if refresh also fails

**Given** a refresh token is expired or revoked
**When** token refresh is attempted
**Then** the integration status changes to "Reconnection Required"
**And** user is notified via in-app notification
**And** integration is marked inactive (not deleted)

**Given** token refresh succeeds
**When** updating the Integration record
**Then** expiresAt is updated to new expiry time
**And** lastRefreshedAt timestamp is recorded

**Technical Notes:**
- Run token refresh job via BullMQ scheduled task (every 5 min)
- Implement exponential backoff for refresh failures
- Use database transaction for token update
- Circuit breaker for repeated refresh failures (5 failures = mark inactive)

---

### Story 6.5: Integration Disconnect & Revoke

As a Tenant Owner,
I want to disconnect integrations and revoke access,
So that I maintain control over which services access my data.

**Acceptance Criteria:**

**Given** a Tenant Owner views a connected integration
**When** they click "Disconnect"
**Then** a confirmation modal appears explaining consequences
**And** warns that synced data may become stale

**Given** user confirms disconnection
**When** processing the disconnect request
**Then** the system calls the provider's token revocation endpoint
**And** encrypted tokens are securely deleted (not just nulled)
**And** Integration status changes to "Disconnected"

**Given** token revocation fails (provider unavailable)
**When** handling the error
**Then** local tokens are still deleted
**And** warning is logged about potential orphaned access
**And** user is informed that provider-side revocation may be needed

**Given** an integration is disconnected
**When** any feature tries to use that integration
**Then** it fails gracefully with "Integration not connected" message
**And** suggests reconnecting in Settings

**Technical Notes:**
- HubSpot revocation: DELETE /oauth/v1/refresh-tokens/{token}
- Google revocation: POST /revoke with token parameter
- Figma revocation: POST /oauth/revoke
- Soft delete pattern: keep record with status "Disconnected" for audit

---

### Story 6.6: Native Export Functionality

As a user,
I want to export my conversations, notes, and knowledge base in Markdown, JSON, or PDF,
So that I can backup my data or use it in other tools.

**Acceptance Criteria:**

**Given** a user is viewing a conversation
**When** they click "Export" and select Markdown
**Then** the conversation is formatted as clean Markdown
**And** includes metadata (date, participants, session ID)
**And** downloads with filename: mentor-conversation-{date}.md

**Given** a user is viewing a conversation
**When** they click "Export" and select JSON
**Then** the conversation exports as structured JSON
**And** includes all messages with roles, timestamps, citations
**And** downloads with filename: mentor-conversation-{date}.json

**Given** a user wants to export multiple items
**When** they select "Bulk Export" from Knowledge Base
**Then** they can select multiple items (notes, concepts, conversations)
**And** export as single ZIP archive
**And** folder structure reflects item types

**Given** a user selects PDF export
**When** processing the export
**Then** the system generates styled PDF
**And** includes branding header (configurable by tenant)
**And** proper pagination for long documents

**Given** export processing takes time
**When** the export is large
**Then** user sees progress indicator
**And** export processes in background (BullMQ job)
**And** download link is provided via notification when ready

**Technical Notes:**
- Use @spartan-ng/ui-dialog for export options modal
- PDF generation via puppeteer or similar server-side library
- Store exports temporarily (24h) in cloud storage (S3/equivalent)
- Respect rate limits: max 10 exports per hour per user

---

### Story 6.7: Integration Health Dashboard

As a Tenant Owner,
I want to view the health status of all my integrations,
So that I can ensure data connections are working properly.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to Settings > Integrations
**When** the page loads
**Then** each integration shows current status:
  - Connected (green indicator)
  - Warning (yellow - token expiring soon)
  - Error (red - connection failed)
  - Disconnected (gray)

**Given** an integration has status "Connected"
**When** viewing details
**Then** they see: last successful sync, token expiry date, data usage stats
**And** "Test Connection" button to verify manually

**Given** a user clicks "Test Connection"
**When** the test runs
**Then** system makes lightweight API call to provider
**And** displays success/failure with latency info
**And** updates lastTestedAt timestamp

**Given** an integration has status "Error"
**When** viewing details
**Then** they see error description and timestamp
**And** suggested resolution steps
**And** "Reconnect" button if re-auth is needed

**Given** viewing the Integration Health Dashboard
**When** any integration status changes
**Then** the dashboard updates in real-time (WebSocket)
**And** change is logged in IntegrationEvent table

**Technical Notes:**
- Create IntegrationEvent entity: { id, integrationId, eventType, status, errorMessage, timestamp }
- Health check endpoints:
  - HubSpot: GET /oauth/v1/access-tokens/{token}
  - Google: GET /oauth2/v1/tokeninfo
  - Figma: GET /v1/me
- Real-time updates via Socket.io room per tenant

---

### Story 6.8: Integration Failure Notifications

As a Tenant Owner,
I want to receive notifications when integrations fail,
So that I can quickly restore connections and avoid data gaps.

**Acceptance Criteria:**

**Given** an integration fails health check
**When** the failure is first detected
**Then** an in-app notification is created immediately
**And** notification includes: integration name, error type, timestamp

**Given** an integration enters "Error" status
**When** user has email notifications enabled
**Then** email is sent within 5 minutes of failure
**And** email includes troubleshooting steps
**And** direct link to reconnect

**Given** the same integration fails repeatedly
**When** sending notifications
**Then** notifications are deduplicated (max 1 per hour for same error)
**And** escalation note added after 3 consecutive failures

**Given** an integration recovers from error state
**When** health check succeeds again
**Then** "Recovery" notification is sent
**And** previous error notifications are marked resolved

**Given** user manages notification preferences
**When** configuring integration alerts
**Then** they can enable/disable per integration
**And** choose notification channels (in-app, email)
**And** set quiet hours (no emails during specified times)

**Technical Notes:**
- Notification deduplication uses Redis key: notify:{tenantId}:{integrationId}:{errorType}
- Email via configured email provider (SendGrid/SES)
- Create NotificationPreference entity for per-integration settings
- Quiet hours stored in tenant's timezone

---

## Epic 7: Platform Administration

Enable Platform Owners to manage tenants, monitor system health, and configure platform-wide settings with comprehensive audit capabilities.

### Story 7.1: Tenant Invitation System

As a Platform Owner,
I want to invite new tenants via email with a guided onboarding flow,
So that organizations can easily start using Mentor AI.

**Acceptance Criteria:**

**Given** a Platform Owner navigates to Platform Admin > Tenants
**When** they click "Invite Tenant"
**Then** a form appears with fields: company name, admin email, subscription tier

**Given** a Platform Owner submits a valid tenant invitation
**When** the invitation is processed
**Then** TenantInvitation record is created (prefix: tinv_)
**And** invitation email is sent with secure token link (expires in 7 days)
**And** invitation status shows "Pending"

**Given** a tenant admin clicks the invitation link
**When** the token is valid and not expired
**Then** they see onboarding wizard: account setup, company details, initial user creation
**And** tenant database is provisioned upon completion

**Given** a tenant admin completes onboarding
**When** submitting final step
**Then** Tenant record is created with status "Active"
**And** TenantOwner user is created with RBAC role
**And** welcome email with getting-started guide is sent

**Given** an invitation link has expired
**When** tenant admin clicks it
**Then** they see "Invitation expired" message
**And** option to request a new invitation

**Technical Notes:**
- Create TenantInvitation entity: { id (tinv_), email, companyName, tier, token (hashed), expiresAt, status, invitedBy, createdAt }
- Token: 32-byte random, store SHA-256 hash only
- Provision tenant database via TenantPrismaService.createTenant()
- Onboarding wizard: 4 steps (account, company, branding, confirm)

---

### Story 7.2: Tenant Activation & Deactivation

As a Platform Owner,
I want to activate or deactivate tenant accounts,
So that I can manage tenant lifecycle without losing their data.

**Acceptance Criteria:**

**Given** a Platform Owner views the tenant list
**When** selecting a tenant
**Then** they see tenant details including current status (Active/Inactive/Suspended)

**Given** a Platform Owner clicks "Deactivate" on an active tenant
**When** confirming the action
**Then** tenant status changes to "Inactive"
**And** all active user sessions for that tenant are invalidated
**And** deactivation event is logged in PlatformAuditLog
**And** tenant admin receives notification email

**Given** a tenant is deactivated
**When** any user from that tenant attempts to log in
**Then** they see "Account suspended - contact support" message
**And** login attempt is logged

**Given** a Platform Owner clicks "Activate" on an inactive tenant
**When** confirming the action
**Then** tenant status changes to "Active"
**And** activation event is logged
**And** tenant admin receives "Account restored" email

**Given** a tenant is deactivated
**When** the deactivation period exceeds 90 days
**Then** Platform Owner sees warning about data retention policy
**And** option for permanent deletion (requires 2FA confirmation)

**Technical Notes:**
- Add status field to Tenant: enum { Active, Inactive, Suspended, PendingDeletion }
- Session invalidation via Redis: delete all keys matching sess:{tenantId}:*
- Soft delete pattern: data preserved, access blocked
- Permanent deletion is separate story in Epic 9 (data compliance)

---

### Story 7.3: Platform Usage Analytics Dashboard

As a Platform Owner,
I want to view platform-wide usage analytics,
So that I can understand adoption, identify issues, and plan capacity.

**Acceptance Criteria:**

**Given** a Platform Owner navigates to Platform Admin > Analytics
**When** the dashboard loads
**Then** they see summary cards: total tenants, active users (7d), total conversations, AI token usage

**Given** viewing the analytics dashboard
**When** examining tenant metrics
**Then** they see sortable table: tenant name, users, conversations, AI tokens, storage used, last active
**And** can filter by date range, subscription tier, activity level

**Given** viewing AI usage metrics
**When** examining cost breakdown
**Then** they see: total tokens by model, estimated costs, usage trends (daily/weekly)
**And** per-tenant AI consumption ranking

**Given** a Platform Owner selects a specific tenant
**When** drilling down
**Then** they see tenant-specific analytics:
  - User activity patterns
  - Feature usage breakdown
  - AI tokens by operation type
  - Growth trends

**Given** viewing the dashboard
**When** data updates
**Then** metrics refresh every 5 minutes automatically
**And** "Last updated" timestamp is displayed

**Technical Notes:**
- Aggregate data from per-tenant databases to platform database
- Use materialized views or scheduled aggregation jobs for performance
- Store daily snapshots in PlatformAnalytics table
- Charts via ngx-charts or similar Angular-compatible library

---

### Story 7.4: Tenant Configuration Management

As a Platform Owner,
I want to manage individual tenant settings and feature limits,
So that I can customize the platform experience per organization.

**Acceptance Criteria:**

**Given** a Platform Owner views a tenant's settings
**When** the configuration panel loads
**Then** they see configurable limits:
  - Max users
  - Max storage (GB)
  - AI tokens per month
  - Allowed AI models
  - Feature flags

**Given** a Platform Owner modifies a tenant's limits
**When** saving changes
**Then** new limits are applied immediately
**And** tenant admin is notified of changes
**And** change is logged in PlatformAuditLog with before/after values

**Given** a tenant approaches their limit (80%)
**When** usage check runs
**Then** tenant admin receives warning notification
**And** Platform Owner sees tenant flagged in dashboard

**Given** a tenant exceeds their limit
**When** attempting to use the resource
**Then** action is blocked with clear error message
**And** upgrade path is suggested
**And** Platform Owner is notified

**Given** a Platform Owner toggles feature flags
**When** enabling/disabling features for a tenant
**Then** features become available/unavailable in real-time
**And** UI updates to reflect available features

**Technical Notes:**
- Create TenantConfiguration entity: { tenantId, maxUsers, maxStorageGb, aiTokenQuota, allowedModels[], featureFlags{} }
- Feature flags: object with boolean values for each feature
- Use Redis for real-time limit checking: limit:{tenantId}:{resource}
- Quota reset job runs monthly (configurable per tenant)

---

### Story 7.5: System Health Dashboard

As a Platform Owner,
I want to monitor system health in real-time,
So that I can ensure platform reliability and respond to issues quickly.

**Acceptance Criteria:**

**Given** a Platform Owner navigates to Platform Admin > System Health
**When** the dashboard loads
**Then** they see real-time status of:
  - API response times (p50, p95, p99)
  - Database connections (per tenant DB + platform DB)
  - Redis connectivity and memory
  - AI Gateway queue depth
  - WebSocket connections

**Given** viewing the health dashboard
**When** a service degrades
**Then** status indicator changes from green to yellow/red
**And** alert banner appears with service name and issue

**Given** a Platform Owner clicks on a degraded service
**When** viewing details
**Then** they see recent error logs (last 100)
**And** response time graph (last hour)
**And** suggested remediation steps

**Given** the AI Gateway queue exceeds threshold
**When** queue depth > 100 requests
**Then** warning is displayed
**And** option to scale workers or pause non-critical jobs

**Given** viewing health over time
**When** selecting historical view
**Then** they see uptime percentage by service (24h, 7d, 30d)
**And** incident timeline with resolution notes

**Technical Notes:**
- Health checks via NestJS Terminus module
- Metrics collection: custom HealthService polling every 30 seconds
- Store health snapshots in HealthMetrics table (time-series)
- Real-time updates via WebSocket (admin room)
- Thresholds configurable in platform settings

---

### Story 7.6: Platform Audit Logs

As a Platform Owner,
I want comprehensive audit logs of all administrative actions,
So that I can maintain security compliance and investigate incidents.

**Acceptance Criteria:**

**Given** a Platform Owner navigates to Platform Admin > Audit Logs
**When** the log viewer loads
**Then** they see chronological list of admin actions:
  - Timestamp
  - Actor (user email)
  - Action type
  - Target (tenant/user/resource)
  - Details (JSON diff where applicable)

**Given** viewing audit logs
**When** filtering
**Then** they can filter by: date range, actor, action type, target tenant
**And** search by keyword in details

**Given** an administrative action is performed
**When** the action completes
**Then** audit log entry is created automatically
**And** includes IP address and user agent
**And** before/after state for modifications

**Given** a Platform Owner exports audit logs
**When** selecting date range and format (CSV/JSON)
**Then** export is generated and downloaded
**And** export event itself is logged

**Given** audit log retention period is reached
**When** logs exceed 2 years
**Then** old logs are archived to cold storage
**And** remain searchable via archive query interface

**Technical Notes:**
- Create PlatformAuditLog entity: { id (plog_), timestamp, actorId, actorEmail, actionType, targetType, targetId, details (JSONB), ipAddress, userAgent }
- Action types enum: TENANT_CREATE, TENANT_DEACTIVATE, CONFIG_UPDATE, USER_IMPERSONATE, etc.
- Use database triggers or NestJS interceptor for automatic logging
- Index on timestamp, actorId, actionType for query performance

---

### Story 7.7: Emergency Tenant Access

As a Platform Owner,
I want secure, audited access to tenant accounts for support purposes,
So that I can help troubleshoot issues while maintaining trust.

**Acceptance Criteria:**

**Given** a Platform Owner needs to access a tenant account
**When** they initiate "Support Access" from tenant details
**Then** they must provide: reason, expected duration, ticket number (optional)
**And** confirm with 2FA

**Given** support access is authorized
**When** the session starts
**Then** Platform Owner can view tenant data as read-only by default
**And** "Support Mode" banner is visible throughout
**And** all actions are logged with elevated detail

**Given** write access is required
**When** Platform Owner requests write privileges
**Then** additional confirmation is required
**And** write actions are logged with full before/after diff
**And** tenant admin is notified of write access

**Given** support session ends or times out
**When** the duration expires or owner logs out
**Then** access is revoked immediately
**And** session summary is generated
**And** tenant admin receives session report email

**Given** viewing support access history
**When** Platform Owner checks past sessions
**Then** they see: all support sessions, duration, actions taken, reason provided
**And** tenant admin can also view this history for their tenant

**Technical Notes:**
- Create SupportSession entity: { id (supp_), platformOwnerId, tenantId, reason, ticketNumber, startedAt, endedAt, accessLevel, actionsCount }
- Session timeout: 1 hour default, max 4 hours
- Generate JWT with special support claim for access routing
- All queries in support mode tagged for audit trail

---

### Story 7.8: Custom Branding Per Tenant

As a Platform Owner,
I want to configure custom branding for each tenant,
So that organizations can have a white-labeled experience.

**Acceptance Criteria:**

**Given** a Platform Owner opens tenant branding settings
**When** the configuration panel loads
**Then** they see customizable options:
  - Logo (light and dark versions)
  - Primary color
  - Secondary color
  - Favicon
  - Custom domain (optional)

**Given** a Platform Owner uploads a logo
**When** the image is processed
**Then** it is validated (format, size, dimensions)
**And** resized to required dimensions
**And** stored securely in cloud storage
**And** old logo is replaced (not duplicated)

**Given** a Platform Owner sets custom colors
**When** previewing changes
**Then** live preview shows color application
**And** accessibility contrast ratio is validated
**And** warning if contrast is insufficient (WCAG AA)

**Given** branding is saved
**When** tenant users access the platform
**Then** they see customized branding
**And** CSS variables are injected based on tenant config
**And** caching headers ensure fresh branding loads

**Given** a tenant has custom domain configured
**When** users access via that domain
**Then** they see the custom branding
**And** SSL certificate is provisioned automatically
**And** default domain redirects to custom domain (optional)

**Technical Notes:**
- Create TenantBranding entity: { tenantId, logoLightUrl, logoDarkUrl, primaryColor, secondaryColor, faviconUrl, customDomain }
- Logo storage: S3/CloudStorage with CDN
- CSS custom properties: --brand-primary, --brand-secondary injected at runtime
- Custom domains: integration with DNS provider API + Let's Encrypt
- Image validation: max 2MB, PNG/SVG only, min 200x50px

---

## Epic 8: Subscription & Billing Management

Enable self-service subscription management with tiered plans, usage-based billing, and Stripe integration for seamless payment processing.

### Story 8.1: Subscription Tier Display

As a prospective customer,
I want to view available subscription tiers with features and pricing,
So that I can choose the plan that best fits my needs.

**Acceptance Criteria:**

**Given** a visitor navigates to the pricing page
**When** the page loads
**Then** they see all available tiers displayed:
  - Free (if applicable)
  - Starter
  - Professional
  - Enterprise
**And** each tier shows: price, billing frequency, feature list

**Given** viewing tier comparison
**When** examining features
**Then** they see clear comparison table showing:
  - AI tokens included
  - Number of users
  - Storage limits
  - Available integrations
  - Support level

**Given** a logged-in user views pricing
**When** on the subscription page
**Then** their current plan is highlighted
**And** upgrade options show price difference
**And** "Current Plan" badge appears on active tier

**Given** annual billing option exists
**When** user toggles billing frequency
**Then** pricing updates to show annual discount
**And** savings amount is displayed prominently

**Technical Notes:**
- Create SubscriptionTier entity: { id, name, monthlyPrice, annualPrice, features (JSONB), aiTokenQuota, userLimit, storageGb, sortOrder }
- Store tiers in database for runtime flexibility
- Cache tier data in Redis (5 min TTL)
- Feature flags in tier determine UI capabilities

---

### Story 8.2: Stripe Checkout Integration

As a Tenant Owner,
I want to subscribe via Stripe Checkout,
So that I can securely pay for my chosen plan.

**Acceptance Criteria:**

**Given** a user selects a subscription tier
**When** they click "Subscribe" or "Upgrade"
**Then** a Stripe Checkout session is created
**And** user is redirected to Stripe's hosted checkout page
**And** session includes: customer email, plan details, success/cancel URLs

**Given** user completes payment on Stripe
**When** payment succeeds
**Then** user is redirected to success page
**And** Subscription record is created (prefix: sub_)
**And** tenant tier is updated to match subscription

**Given** user cancels during checkout
**When** they click cancel on Stripe page
**Then** they return to pricing page
**And** no subscription is created
**And** friendly message encourages them to try again

**Given** checkout session expires
**When** 24 hours pass without completion
**Then** session is invalidated
**And** user can start new checkout

**Technical Notes:**
- Use Stripe Checkout Session API (not custom forms)
- Create Subscription entity: { id (sub_), tenantId, stripeSubscriptionId, stripeCustomerId, tierId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd }
- Store Stripe customer ID on Tenant for future use
- Success URL includes session_id for verification

---

### Story 8.3: Plan Upgrade and Downgrade

As a Tenant Owner,
I want to upgrade or downgrade my subscription plan,
So that I can adjust my subscription as my needs change.

**Acceptance Criteria:**

**Given** a Tenant Owner views their current subscription
**When** they click "Change Plan"
**Then** they see available plans with current plan highlighted
**And** price difference (prorated) is calculated and displayed

**Given** a user selects an upgrade
**When** confirming the change
**Then** Stripe subscription is updated with new plan
**And** proration is applied (charge difference immediately)
**And** new features are available immediately
**And** confirmation email is sent

**Given** a user selects a downgrade
**When** confirming the change
**Then** downgrade is scheduled for end of current period
**And** user retains current features until period ends
**And** message confirms when downgrade takes effect

**Given** a user has pending downgrade
**When** viewing subscription page
**Then** they see current plan AND scheduled plan
**And** option to cancel the pending downgrade

**Given** usage exceeds new plan limits
**When** downgrade is selected
**Then** warning is displayed about affected features
**And** user must acknowledge before proceeding

**Technical Notes:**
- Use Stripe's proration_behavior: 'create_prorations' for upgrades
- Downgrades use proration_behavior: 'none' (change at period end)
- Update Subscription.tierId immediately for upgrades
- For downgrades, store scheduledTierId field
- Webhook handles actual tier change at period end

---

### Story 8.4: Subscription Cancellation

As a Tenant Owner,
I want to cancel my subscription,
So that I can stop paying if I no longer need the service.

**Acceptance Criteria:**

**Given** a Tenant Owner clicks "Cancel Subscription"
**When** the cancellation flow starts
**Then** they see:
  - Current billing period end date
  - What happens after cancellation (data retention period)
  - Option to provide cancellation reason
  - Win-back offer (optional discount to stay)

**Given** a user confirms cancellation
**When** cancellation is processed
**Then** Stripe subscription is set to cancel at period end
**And** Subscription.cancelAtPeriodEnd is set to true
**And** cancellation confirmation email is sent
**And** Platform Owner is notified

**Given** subscription is scheduled for cancellation
**When** user views their subscription
**Then** they see "Cancels on [date]"
**And** option to reactivate before that date

**Given** a user reactivates before period end
**When** clicking "Reactivate"
**Then** Stripe cancellation is reversed
**And** subscription continues normally
**And** reactivation confirmation is sent

**Given** cancellation period ends
**When** Stripe webhook fires
**Then** tenant is downgraded to free tier (if exists) or deactivated
**And** data is retained per retention policy (30 days minimum)

**Technical Notes:**
- Use Stripe cancel_at_period_end: true (not immediate cancel)
- Cancellation reasons: too_expensive, missing_features, switching_competitor, temporary_pause, other
- Store cancellation reason in CancellationFeedback table
- Grace period: 30 days data retention after cancellation

---

### Story 8.5: Invoice History & Receipts

As a Tenant Owner,
I want to view and download my invoice history,
So that I can manage my accounting and expense tracking.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to Billing > Invoices
**When** the page loads
**Then** they see list of all invoices:
  - Invoice date
  - Amount
  - Status (paid, pending, failed)
  - Invoice number

**Given** a user clicks on an invoice
**When** viewing invoice details
**Then** they see line items, taxes, total
**And** "Download PDF" button

**Given** a user clicks "Download PDF"
**When** the download is processed
**Then** Stripe-hosted PDF is retrieved and downloaded
**And** filename includes invoice number and date

**Given** a new invoice is generated
**When** the billing cycle completes
**Then** invoice appears in history within 24 hours
**And** invoice receipt email is sent

**Given** a user needs invoices for tax purposes
**When** filtering by date range
**Then** they can select year or custom range
**And** download all invoices as ZIP

**Technical Notes:**
- Fetch invoices from Stripe API: /v1/invoices?customer={id}
- Cache invoice list in Redis (1 hour TTL)
- Use Stripe's hosted_invoice_url for PDF download
- Store invoice metadata locally for faster listing: Invoice table { stripeInvoiceId, tenantId, amount, status, invoiceDate, pdfUrl }

---

### Story 8.6: Payment Method Management

As a Tenant Owner,
I want to manage my payment methods,
So that I can update my card or add backup payment options.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to Billing > Payment Methods
**When** the page loads
**Then** they see current payment method:
  - Card brand and last 4 digits
  - Expiration date
  - Default indicator

**Given** a user clicks "Add Payment Method"
**When** the form appears
**Then** Stripe Elements (card input) is displayed
**And** card details are entered directly to Stripe (PCI compliant)

**Given** a user saves a new payment method
**When** card is valid and processed
**Then** payment method is attached to Stripe customer
**And** option to set as default appears
**And** confirmation message shown

**Given** a user has multiple payment methods
**When** viewing the list
**Then** they can set default, or delete non-default methods
**And** cannot delete last payment method while subscription active

**Given** a card is expiring soon
**When** within 30 days of expiration
**Then** warning banner appears on billing page
**And** email notification sent to update card

**Technical Notes:**
- Use Stripe Elements for PCI compliance (no card data on our server)
- Stripe SetupIntent for adding cards without immediate charge
- PaymentMethod entity: { stripePaymentMethodId, tenantId, cardBrand, last4, expiryMonth, expiryYear, isDefault }
- Sync payment methods via webhook

---

### Story 8.7: Usage Metering Dashboard

As a Tenant Owner,
I want to view my current usage against plan limits,
So that I can monitor consumption and avoid unexpected overages.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to Billing > Usage
**When** the dashboard loads
**Then** they see usage meters for:
  - AI tokens used / quota
  - Storage used / limit
  - Active users / limit
  - API calls (if applicable)

**Given** viewing usage meters
**When** examining each metric
**Then** progress bar shows percentage used
**And** color indicates status (green < 70%, yellow 70-90%, red > 90%)
**And** reset date is displayed

**Given** usage approaches limit (80%)
**When** the threshold is crossed
**Then** warning indicator appears
**And** in-app notification is triggered
**And** email sent if preference enabled

**Given** a user clicks on a usage metric
**When** viewing details
**Then** they see daily usage breakdown (chart)
**And** trend compared to previous period
**And** projected usage at current rate

**Given** the billing period resets
**When** new period starts
**Then** usage counters reset to zero
**And** historical data is preserved for reporting

**Technical Notes:**
- Real-time usage from Redis: usage:{tenantId}:{metric}:{period}
- Store daily snapshots in UsageSnapshot table
- Charts via ngx-charts showing last 30 days
- Projection: (current_usage / days_elapsed) * days_in_period

---

### Story 8.8: Overage Handling

As a Tenant Owner,
I want clear options when I exceed plan limits,
So that I can continue working without disruption.

**Acceptance Criteria:**

**Given** a tenant reaches 100% of a usage limit
**When** attempting to use more of that resource
**Then** they see soft block with options:
  - Upgrade plan
  - Purchase one-time token pack (if available)
  - Wait for reset

**Given** overage billing is enabled for the plan
**When** usage exceeds limit
**Then** additional usage is tracked
**And** overage charges appear on next invoice
**And** user is notified of accruing charges

**Given** hard limit is configured
**When** usage exceeds 110% of limit
**Then** resource is blocked until upgrade or reset
**And** clear message explains why and how to resolve

**Given** a Tenant Owner views pending overages
**When** on the usage dashboard
**Then** they see estimated overage charges
**And** breakdown by resource type

**Given** one-time token packs are available
**When** user purchases a pack
**Then** tokens are added to current balance immediately
**And** separate line item on invoice
**And** pack tokens don't roll over (expire at period end)

**Technical Notes:**
- Overage tracking: overage:{tenantId}:{metric}:{period} in Redis
- Overage pricing defined in SubscriptionTier.overageRates (JSONB)
- Token packs: TokenPack entity with fixed amounts and prices
- Stripe usage-based billing for overages (metered billing)

---

### Story 8.9: Stripe Webhook Processing

As a system,
I want to process Stripe webhooks reliably,
So that subscription state stays synchronized with payments.

**Acceptance Criteria:**

**Given** Stripe sends a webhook event
**When** the webhook endpoint receives it
**Then** signature is verified using webhook secret
**And** event is logged (without sensitive data)
**And** appropriate handler is invoked

**Given** webhook event is `invoice.paid`
**When** processing the event
**Then** Subscription status is set to "active"
**And** currentPeriodStart/End are updated
**And** receipt email is triggered

**Given** webhook event is `invoice.payment_failed`
**When** processing the event
**Then** Subscription status is set to "past_due"
**And** tenant admin is notified immediately
**And** retry schedule is communicated

**Given** webhook event is `customer.subscription.deleted`
**When** processing the event
**Then** Subscription status is set to "cancelled"
**And** tenant is downgraded to free tier or deactivated
**And** final notification sent

**Given** webhook processing fails
**When** an error occurs
**Then** event is stored in FailedWebhook table
**And** retry is scheduled (exponential backoff)
**And** alert sent after 3 failures

**Technical Notes:**
- Webhook endpoint: POST /api/webhooks/stripe
- Verify signature with stripe.webhooks.constructEvent()
- Idempotency: store processed event IDs to prevent duplicates
- Handle events: invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted, payment_method.attached
- FailedWebhook entity: { id, eventId, eventType, payload, error, attempts, lastAttempt, status }

---

### Story 8.10: Billing Notifications

As a Tenant Owner,
I want to receive notifications for billing events,
So that I stay informed about my subscription status.

**Acceptance Criteria:**

**Given** an invoice is generated
**When** the billing cycle starts
**Then** email is sent with: amount, due date, link to view invoice

**Given** a payment succeeds
**When** invoice is paid
**Then** receipt email is sent with: amount paid, next billing date, download link

**Given** a payment fails
**When** initial charge is declined
**Then** email is sent immediately with: failure reason, link to update payment method, retry date

**Given** payment continues to fail
**When** after each retry attempt
**Then** escalating notifications are sent:
  - Day 1: "Payment failed, we'll retry"
  - Day 3: "Still failing, please update card"
  - Day 7: "Final notice, subscription will cancel"

**Given** subscription will renew
**When** 7 days before renewal
**Then** reminder email sent with: renewal date, amount, current plan

**Given** a user manages notification preferences
**When** configuring billing alerts
**Then** they can enable/disable:
  - Invoice generated
  - Payment succeeded
  - Payment failed
  - Renewal reminders

**Technical Notes:**
- Use email templates for each notification type
- BillingNotificationPreference entity: { tenantId, invoiceGenerated, paymentSucceeded, paymentFailed, renewalReminder }
- Dunning (failed payment) flow managed by Stripe + our notifications
- Queue emails via BullMQ for reliable delivery

---

## Epic 9: Security, Compliance & Data Protection

Ensure platform security with comprehensive audit logging, data export capabilities for GDPR compliance, and robust data protection measures across all tenant data.

### Story 9.1: User Activity Audit Trail

As a Tenant Owner,
I want comprehensive audit logs of user activities,
So that I can monitor usage patterns and investigate security concerns.

**Acceptance Criteria:**

**Given** a user performs a significant action
**When** the action completes
**Then** an audit log entry is created with:
  - Timestamp (UTC)
  - User ID and email
  - Action type
  - Resource affected
  - IP address
  - Success/failure status

**Given** a Tenant Owner navigates to Settings > Audit Logs
**When** the log viewer loads
**Then** they see chronological list of activities
**And** can filter by: user, action type, date range, resource type

**Given** viewing audit logs
**When** searching
**Then** they can search by keyword in action details
**And** results highlight matching terms

**Given** the following actions occur
**When** they complete
**Then** they are logged:
  - Login/logout
  - Session created (conversation start)
  - Document uploaded/deleted
  - Knowledge base modified
  - Client/project CRUD operations
  - Export performed
  - Settings changed

**Given** a user exports audit logs
**When** selecting format (CSV/JSON) and date range
**Then** export is generated and downloaded
**And** export event itself is logged

**Technical Notes:**
- Create UserActivityLog entity: { id (ulog_), tenantId, userId, userEmail, actionType, resourceType, resourceId, details (JSONB), ipAddress, userAgent, status, timestamp }
- Index on (tenantId, timestamp), (tenantId, userId), (tenantId, actionType)
- Action types enum: LOGIN, LOGOUT, SESSION_CREATE, DOCUMENT_UPLOAD, etc.
- Retention: configurable per tenant, default 90 days

---

### Story 9.2: GDPR Data Export (Right to Access)

As a user,
I want to export all my personal data,
So that I can exercise my GDPR right to access.

**Acceptance Criteria:**

**Given** a user navigates to Settings > Privacy
**When** they click "Request My Data"
**Then** they see explanation of what will be included
**And** estimated processing time
**And** confirmation button

**Given** a user confirms data export request
**When** the request is submitted
**Then** DataExportRequest record is created (prefix: dxr_)
**And** request is queued for background processing
**And** user receives confirmation email with expected timeframe

**Given** data export is processing
**When** the job runs
**Then** it collects all user data:
  - Profile information
  - All conversations and messages
  - Uploaded documents
  - Knowledge base entries
  - Activity logs
  - Preferences and settings

**Given** data export completes
**When** within 72 hours (GDPR requirement)
**Then** user receives email with secure download link
**And** link expires after 7 days
**And** data is provided as ZIP with structured JSON + readable summary

**Given** a user has large data volume
**When** export exceeds reasonable size
**Then** export is split into multiple files
**And** index file lists all included files

**Technical Notes:**
- DataExportRequest entity: { id (dxr_), userId, tenantId, status, requestedAt, completedAt, downloadUrl, expiresAt }
- BullMQ job with priority queue for GDPR requests
- Data packaged as: profile.json, conversations/, documents/, activity.json, README.txt
- Encrypt ZIP with user-provided password or generated one-time password
- Max processing time: 72 hours per GDPR Article 12

---

### Story 9.3: Account Deletion (Right to Erasure)

As a user,
I want to delete my account and all associated data,
So that I can exercise my GDPR right to be forgotten.

**Acceptance Criteria:**

**Given** a user navigates to Settings > Privacy
**When** they click "Delete My Account"
**Then** they see warning explaining:
  - What will be deleted
  - What may be retained (legal requirements)
  - That this action is irreversible
  - 30-day grace period before permanent deletion

**Given** a user confirms account deletion
**When** providing password confirmation
**Then** account status changes to "PendingDeletion"
**And** deletion scheduled for 30 days
**And** confirmation email sent with cancellation link
**And** user is logged out

**Given** deletion is scheduled
**When** user logs in during grace period
**Then** they see banner: "Account scheduled for deletion on [date]"
**And** option to cancel deletion

**Given** user cancels deletion during grace period
**When** clicking cancel link (email) or in-app button
**Then** account is restored to normal status
**And** deletion job is cancelled
**And** confirmation sent

**Given** grace period expires
**When** deletion job runs
**Then** all user data is permanently deleted:
  - User record (anonymized, not deleted for audit)
  - All conversations and messages
  - All uploaded documents
  - Knowledge base contributions
  - Activity logs (anonymized)

**Given** a Tenant Owner deletes their account
**When** they are the only owner
**Then** deletion is blocked
**And** prompted to transfer ownership or delete tenant

**Technical Notes:**
- DeletionRequest entity: { id, userId, tenantId, requestedAt, scheduledFor, status, cancelledAt }
- Anonymization: replace PII with "DELETED_USER_[hash]"
- Keep anonymized records for: billing audit (7 years), security incidents
- Run deletion jobs via BullMQ scheduled queue
- Notify Platform Owner when user deletion affects shared resources

---

### Story 9.4: Data Retention Policies

As a Tenant Owner,
I want to configure data retention policies,
So that old data is automatically cleaned up per our compliance requirements.

**Acceptance Criteria:**

**Given** a Tenant Owner navigates to Settings > Data Management
**When** viewing retention settings
**Then** they see configurable retention periods for:
  - Conversations: default 365 days
  - Activity logs: default 90 days
  - Deleted items: default 30 days
  - Export files: default 7 days

**Given** a Tenant Owner modifies retention period
**When** saving changes
**Then** new retention policy is applied to future data
**And** warning shown if reducing (will trigger cleanup)
**And** change is logged in audit

**Given** retention period is set
**When** data exceeds the retention period
**Then** automated cleanup job runs (nightly)
**And** data is permanently deleted
**And** cleanup summary logged

**Given** a user views a conversation
**When** it is approaching retention limit (30 days)
**Then** warning badge appears
**And** option to "Keep Forever" (exempt from retention)

**Given** legal hold is required
**When** Tenant Owner enables legal hold on user/date range
**Then** matching data is exempt from retention cleanup
**And** hold reason is documented
**And** hold expires on specified date or manual release

**Technical Notes:**
- RetentionPolicy entity: { tenantId, resourceType, retentionDays, updatedAt, updatedBy }
- LegalHold entity: { id, tenantId, reason, targetType, targetId, startsAt, expiresAt, createdBy }
- Cleanup job: runs nightly at 3 AM UTC, processes in batches
- Keep exempt flag on records: retentionExempt: boolean, exemptReason: string

---

### Story 9.5: Consent Management

As a user,
I want to manage my consent preferences,
So that I control how my data is used.

**Acceptance Criteria:**

**Given** a new user completes registration
**When** onboarding starts
**Then** consent modal appears requesting:
  - Required: Terms of Service, Privacy Policy
  - Optional: Marketing communications
  - Optional: Product improvement analytics
  - Optional: AI training data contribution

**Given** a user provides consent
**When** checking boxes and confirming
**Then** ConsentRecord is created for each item
**And** timestamp and consent version recorded
**And** user can proceed

**Given** a user views Settings > Privacy
**When** the consent section loads
**Then** they see all consent items with current status
**And** can toggle optional consents
**And** cannot revoke required consents (must delete account)

**Given** a user changes consent preference
**When** toggling an optional consent
**Then** new ConsentRecord is created (version history)
**And** systems respect new preference immediately
**And** change is logged

**Given** Terms of Service or Privacy Policy is updated
**When** user next logs in
**Then** they are prompted to review and re-consent
**And** cannot proceed until acknowledged
**And** new consent version is recorded

**Given** consent records are needed for audit
**When** Tenant Owner exports consent data
**Then** they receive complete consent history per user
**And** includes: consent type, version, timestamp, IP address

**Technical Notes:**
- ConsentRecord entity: { id, userId, tenantId, consentType, consentVersion, granted, timestamp, ipAddress }
- Consent types enum: TERMS_OF_SERVICE, PRIVACY_POLICY, MARKETING, ANALYTICS, AI_TRAINING
- Version tracking: store document versions separately, reference in consent
- Double opt-in for marketing (email confirmation)

---

### Story 9.6: Security Event Logging

As a security administrator,
I want comprehensive security event logs,
So that I can detect and investigate security incidents.

**Acceptance Criteria:**

**Given** a login attempt occurs
**When** processing the authentication
**Then** security event is logged:
  - Success/failure
  - Username attempted
  - IP address and geolocation
  - User agent
  - Auth method (password, SSO, etc.)

**Given** multiple failed login attempts occur
**When** threshold exceeded (5 attempts in 15 minutes)
**Then** account is temporarily locked
**And** security alert is generated
**And** user notified via email of suspicious activity

**Given** unusual activity is detected
**When** patterns match security rules:
  - Login from new country
  - Multiple simultaneous sessions
  - Password change followed by bulk export
**Then** security event is flagged for review
**And** alert sent to tenant admin

**Given** a Platform Owner views security dashboard
**When** examining security events
**Then** they see: failed logins, locked accounts, flagged activities
**And** can filter by severity, tenant, time range

**Given** session anomaly is detected
**When** session token is used from different IP/device
**Then** session is invalidated
**And** user forced to re-authenticate
**And** security event logged

**Given** security logs are needed for investigation
**When** exporting security events
**Then** complete details are included
**And** logs cannot be modified (append-only)
**And** tamper-evident hash chain maintained

**Technical Notes:**
- SecurityEvent entity: { id (sevt_), tenantId, userId, eventType, severity, ipAddress, geoLocation, userAgent, details (JSONB), timestamp }
- Severity levels: INFO, WARNING, CRITICAL
- Event types: LOGIN_SUCCESS, LOGIN_FAILURE, ACCOUNT_LOCKED, SUSPICIOUS_ACTIVITY, SESSION_INVALIDATED, PASSWORD_CHANGED
- Geolocation via MaxMind GeoIP database
- Hash chain: each event includes hash of previous event for tamper detection

---

### Story 9.7: Data Encryption at Rest

As a platform,
I want all sensitive data encrypted at rest,
So that data breaches don't expose plaintext sensitive information.

**Acceptance Criteria:**

**Given** sensitive data is stored
**When** writing to database
**Then** the following fields are encrypted:
  - OAuth tokens (integrations)
  - API keys
  - Personal identifiable information (configurable)
  - Document contents (optional, performance trade-off)

**Given** encryption is configured
**When** keys are managed
**Then** encryption keys are:
  - Stored in secure key vault (AWS KMS / Azure Key Vault / HashiCorp Vault)
  - Rotated automatically (annual minimum)
  - Tenant-specific derived keys

**Given** key rotation occurs
**When** new key version is active
**Then** new data uses new key
**And** background job re-encrypts old data
**And** old key retained until re-encryption complete

**Given** database backup is performed
**When** backup file is created
**Then** encrypted data remains encrypted
**And** backup encryption key is separate from data keys
**And** backups are stored in encrypted storage

**Given** an authorized query runs
**When** reading encrypted fields
**Then** decryption is transparent to application
**And** decrypted values never logged
**And** memory is cleared after use (where possible)

**Given** encryption audit is requested
**When** Platform Owner views encryption status
**Then** they see: encrypted field inventory, key versions in use, last rotation date, pending re-encryption jobs

**Given** data encryption verification is tested
**When** querying the database directly (bypassing application layer)
**Then** sensitive fields contain encrypted ciphertext (not plaintext)
**And** ciphertext length confirms AES-256-GCM format
**And** different records have different ciphertext (IV uniqueness verified)

**Technical Notes:**
- Use AES-256-GCM for field-level encryption
- Key hierarchy: Master Key (KMS) > Tenant Key (derived) > Field Key (per-type)
- Prisma middleware for transparent encrypt/decrypt
- Encrypted fields marked in schema: @encrypted custom attribute
- Performance: consider column-level vs application-level encryption trade-offs
- Never log decrypted values; use field redaction in logging

---

# Autonomous Business Brain Extension Epics

_The following epics extend Mentor AI with autonomous workflow capabilities, enhanced knowledge base features, and market signal processing. These build upon the existing foundation (Epics 1-9)._

## Extension Requirements Inventory

### Extension Functional Requirements (EXT-01 to EXT-14)

**LLM Tenant Isolation:**
- EXT-01: Implement TenantContextBuilder for LLM tenant isolation with mandatory tenantId
- EXT-02: Add correlation IDs to all audit logs and error responses
- EXT-03: Audit every LLM call with { correlationId, tenantId, contextHash, tokenCount, modelId }

**Workflow Engine:**
- EXT-04: Create Workflow model with JSON state storage and transactional checkpoints
- EXT-05: Create WorkflowTask model with visible status/progress for frontend
- EXT-06: Implement BMAD-style workflow processing (internal invisible, Tasks visible)
- EXT-07: Implement WebSocket events: workflow.task.created, workflow.task.updated, workflow.task.completed, workflow.task.failed

**Risk Classification:**
- EXT-08: Implement hybrid risk classification (rules-first, AI bumps up only)
- EXT-09: Create RiskLevel enum with LOW, MEDIUM, HIGH, REQUIRES_APPROVAL values

**Knowledge Base Extension:**
- EXT-10: Extend Concept model with language, hierarchyCode, parentId, knowledgeDomain, sourceVersion
- EXT-11: Implement Serbian concept seeding (500+ concepts with decimal hierarchy codes)
- EXT-12: Implement cross-language semantic search using BGE-M3 embeddings
- EXT-13: Implement concept staleness detection using sourceVersion comparison

**Market Signals:**
- EXT-14: Create SignalSource model with circuit breaker (3 failures → auto-disable)

---

## Epic 10: Schema Migration & Extension Foundation

**Goal:** Extend the existing Mentor AI database schema with new models and fields required for autonomous workflows, risk classification, and enhanced knowledge base capabilities.

**Dependencies:** Epics 1-9 (Base Mentor AI) must be complete
**Architecture Reference:** autonomous-business-brain-architecture.md - Data Architecture section

---

### Story 10.1: Concept Model Extensions

As a developer,
I want to extend the Concept model with multi-language and hierarchy support,
So that we can store Serbian concepts with proper parent-child relationships.

**Acceptance Criteria:**

**Given** the existing Concept model
**When** migration is applied
**Then** the following fields are added:
  - `language` (String, default: "en")
  - `hierarchyCode` (String, nullable) - e.g., "1.1", "2.1.1"
  - `parentId` (String, nullable) - self-referential FK
  - `knowledgeDomain` (String, nullable) - e.g., "Vrednost", "Marketing"
  - `tags` (String[]) - e.g., ["psychology", "pricing"]
  - `sourceVersion` (String, nullable) - e.g., "serbian-hierarchy-v1-2026-02-06"

**Given** hierarchyCode validation is needed
**When** saving a concept with hierarchyCode
**Then** it must match pattern `/^(\d+\.)*\d+$/`
**And** valid examples: "1", "1.1", "2.1.1", "4.1.10"

**Given** indexes are needed for performance
**When** migration completes
**Then** indexes exist on: language, hierarchyCode, knowledgeDomain

**Technical Notes:**
- Prisma schema extension - add fields to existing Concept model
- Self-referential relation: `parent Concept? @relation("ConceptHierarchy", fields: [parentId], references: [id])`
- Hierarchy code regex: `const HIERARCHY_CODE_PATTERN = /^(\d+\.)*\d+$/`

---

### Story 10.2: Workflow Model Creation

As a developer,
I want to create a Workflow model for storing autonomous workflow state,
So that workflows can persist across failures and resume from checkpoints.

**Acceptance Criteria:**

**Given** no Workflow model exists
**When** migration is applied
**Then** Workflow model is created with:
  - `id` (String, cuid, prefixed `wfl_`)
  - `tenantId` (String, required)
  - `type` (String, required) - workflow type identifier
  - `state` (Json) - typed as WorkflowState in service layer
  - `status` (String) - enum: pending | running | completed | failed
  - `checkpoint` (Json, nullable) - last checkpoint data
  - `correlationId` (String, required) - request tracing
  - `createdAt` (DateTime)
  - `updatedAt` (DateTime)

**Given** multi-tenant queries are needed
**When** searching workflows
**Then** compound index exists on [tenantId, status]
**And** index exists on [type]

**Given** WorkflowState interface is needed
**When** accessing state in TypeScript
**Then** interface provides: currentStep, completedSteps[], variables, lastCheckpoint

**Technical Notes:**
- ID prefix: `wfl_` followed by cuid
- JSON state keys must be camelCase (matches TypeScript)
- WorkflowState interface in libs/shared/interfaces/

---

### Story 10.3: WorkflowTask Model Creation

As a developer,
I want to create a WorkflowTask model for visible task tracking,
So that users can see progress of autonomous workflows in real-time.

**Acceptance Criteria:**

**Given** no WorkflowTask model exists
**When** migration is applied
**Then** WorkflowTask model is created with:
  - `id` (String, cuid, prefixed `tsk_`)
  - `workflowId` (String, required)
  - `tenantId` (String, required)
  - `name` (String, required) - human-readable task name
  - `status` (String) - enum: pending | in_progress | completed | failed
  - `result` (Json, nullable) - includes structured error on failure
  - `progress` (Int, nullable) - 0-100 for progress tracking
  - `startedAt` (DateTime, nullable)
  - `completedAt` (DateTime, nullable)

**Given** real-time queries are needed
**When** fetching tenant tasks
**Then** compound index exists on [tenantId, status]
**And** index exists on [name]

**Given** task result includes error
**When** task fails
**Then** result contains: { success: false, error: { code, message, stack? } }

**Technical Notes:**
- ID prefix: `tsk_` followed by cuid
- Relation to Workflow model via workflowId
- WebSocket events emitted on status changes

---

### Story 10.4: SignalSource Model Creation

As a developer,
I want to create a SignalSource model for market signal configuration,
So that tenants can configure their own signal sources with circuit breaker protection.

**Acceptance Criteria:**

**Given** no SignalSource model exists
**When** migration is applied
**Then** SignalSource model is created with:
  - `id` (String, cuid, prefixed `sig_`)
  - `tenantId` (String, required)
  - `url` (String, required)
  - `name` (String, required)
  - `category` (String, required) - enum values
  - `isActive` (Boolean, default: true)
  - `failureCount` (Int, default: 0) - circuit breaker counter
  - `lastFetched` (DateTime, nullable)
  - `disabledAt` (DateTime, nullable)
  - `disabledReason` (String, nullable) - "circuit_breaker" | "user_disabled"

**Given** duplicate URLs per tenant must be prevented
**When** adding signal source
**Then** unique constraint exists on [tenantId, url]

**Given** active sources need efficient querying
**When** fetching active sources for tenant
**Then** compound index exists on [tenantId, isActive]

**Given** SignalCategory enum is needed
**When** setting category
**Then** valid values are: INDUSTRY_NEWS, COMPETITOR, MARKET_DATA, REGULATORY, CUSTOM

**Technical Notes:**
- ID prefix: `sig_` followed by cuid
- Circuit breaker: 3 failures → auto-disable
- CUSTOM category requires customCategoryLabel field (not in MVP)

---

## Epic 11: LLM Tenant Isolation

**Goal:** Implement TenantContextBuilder service that ensures complete isolation of tenant data in LLM context, with comprehensive audit logging for every AI call.

**Dependencies:** Epic 10 (Schema Migration)
**Architecture Reference:** autonomous-business-brain-architecture.md - Security Extensions

---

### Story 11.1: TenantContextBuilder Service

As a developer,
I want a TenantContextBuilder service in the AI Gateway,
So that all LLM calls have properly isolated tenant context with mandatory tenantId.

**Acceptance Criteria:**

**Given** an LLM call is being prepared
**When** building context
**Then** TenantContextBuilder.build(tenantId, userContext) must be called
**And** context is scoped to only that tenant's data
**And** no cross-tenant data can be included

**Given** raw context is passed to LLM
**When** bypassing TenantContextBuilder
**Then** the call must fail with error "LLM context must use TenantContextBuilder"

**Given** context is built successfully
**When** call completes
**Then** correlationId is attached to the request
**And** contextHash is computed for audit purposes

**Technical Notes:**
```typescript
// ❌ BAD: Direct LLM context
await this.llm.generate({ context: userContext });

// ✅ GOOD: Through TenantContextBuilder
const isolatedContext = await this.tenantContextBuilder.build(tenantId, userContext);
await this.llm.generate({ context: isolatedContext, correlationId });
```

---

### Story 11.2: LLM Audit Logging

As a security administrator,
I want comprehensive audit logging for every LLM call,
So that I can trace and investigate any potential data leakage.

**Acceptance Criteria:**

**Given** an LLM call is made
**When** the call completes (success or failure)
**Then** audit log entry is created with:
  - correlationId (request tracing)
  - tenantId
  - timestamp (ISO 8601)
  - contextHash (SHA-256 of context)
  - tokenCount (input + output)
  - modelId (which LLM was used)

**Given** audit logs are queried
**When** investigating a request
**Then** correlationId links all related log entries
**And** full context reconstruction is possible for authorized admins

**Given** audit logs are stored
**When** retention policy is applied
**Then** logs are retained for 7 years (SOC 2 compliance)
**And** logs are append-only (no modification)

**Technical Notes:**
- AuditLogEntry interface in libs/shared/interfaces/
- Store in separate audit table with immutable constraints
- Context hash allows verification without storing full context

---

### Story 11.3: Correlation ID Propagation

As a developer,
I want correlation IDs propagated through all service calls,
So that distributed requests can be traced end-to-end.

**Acceptance Criteria:**

**Given** an HTTP request arrives
**When** no X-Correlation-Id header exists
**Then** generate new correlationId (UUID v4)
**And** attach to request context

**Given** a correlationId exists in request context
**When** making downstream service calls
**Then** correlationId is passed in headers
**And** correlationId is included in all log entries

**Given** an error occurs anywhere in the chain
**When** error response is returned
**Then** correlationId is included in error response
**And** RFC 7807 ProblemDetails includes correlationId field

**Given** WebSocket events are emitted
**When** event is related to a request
**Then** correlationId is included in event payload

**Technical Notes:**
- NestJS interceptor for correlation ID handling
- Header name: X-Correlation-Id
- AsyncLocalStorage for request-scoped context

---

## Epic 12: Workflow Engine

**Goal:** Implement BMAD-style autonomous workflow engine with visible tasks, JSON state persistence, and transactional checkpoints.

**Dependencies:** Epic 10 (Schema Migration), Epic 11 (LLM Tenant Isolation)
**Architecture Reference:** autonomous-business-brain-architecture.md - Workflow State Rules

---

### Story 12.1: Workflow Service Core

As a developer,
I want a WorkflowService that manages workflow lifecycle,
So that autonomous workflows can be created, executed, and tracked.

**Acceptance Criteria:**

**Given** a workflow needs to be started
**When** WorkflowService.create() is called
**Then** Workflow record is created with status "pending"
**And** initial state is stored as JSON
**And** correlationId is assigned

**Given** a workflow is running
**When** step completes successfully
**Then** state.completedSteps[] is updated
**And** state.currentStep is set to next step
**And** checkpoint is created with current state
**And** updatedAt timestamp is refreshed

**Given** a workflow fails
**When** unrecoverable error occurs
**Then** status is set to "failed"
**And** error details are stored in state
**And** notification is sent to user

**Given** a workflow needs to resume
**When** WorkflowService.resume(workflowId) is called
**Then** state is restored from last checkpoint
**And** execution continues from currentStep

**Technical Notes:**
- All state mutations within Prisma transaction
- Checkpoint created after each task completion
- Maximum workflow timeout: 10 minutes (configurable)

---

### Story 12.2: WorkflowTask Service

As a developer,
I want a WorkflowTaskService that manages visible tasks,
So that users can see real-time progress of workflow execution.

**Acceptance Criteria:**

**Given** a workflow task begins
**When** WorkflowTaskService.start(workflowId, taskName) is called
**Then** WorkflowTask record is created with status "in_progress"
**And** startedAt timestamp is set
**And** WebSocket event "workflow.task.created" is emitted

**Given** a task is progressing
**When** progress is updated
**Then** WorkflowTask.progress is set (0-100)
**And** WebSocket event "workflow.task.updated" is emitted with progress

**Given** a task completes successfully
**When** WorkflowTaskService.complete(taskId, result) is called
**Then** status is set to "completed"
**And** result JSON is stored
**And** completedAt timestamp is set
**And** WebSocket event "workflow.task.completed" is emitted

**Given** a task fails
**When** WorkflowTaskService.fail(taskId, error) is called
**Then** status is set to "failed"
**And** result contains error structure: { success: false, error: { code, message } }
**And** WebSocket event "workflow.task.failed" is emitted

**Technical Notes:**
- All WebSocket events include tenantId for filtering
- Event payload includes: tenantId, workflowId, taskId, status, progress?, timestamp

---

### Story 12.3: Workflow Tasks API

As a frontend developer,
I want REST endpoints to query workflow tasks,
So that I can display task progress to users.

**Acceptance Criteria:**

**Given** a user wants to see workflow tasks
**When** GET /api/workflows/:workflowId/tasks is called
**Then** list of WorkflowTask records is returned
**And** filtered by tenant (middleware enforces)
**And** sorted by startedAt descending

**Given** a user wants task details
**When** GET /api/workflows/:workflowId/tasks/:taskId is called
**Then** single WorkflowTask with full result is returned
**And** tenant validation is performed

**Given** a user wants active workflows
**When** GET /api/workflows?status=running is called
**Then** list of running Workflows is returned
**And** each includes task summary (count, completed, failed)

**Technical Notes:**
- All endpoints require authentication
- TenantGuard middleware enforces tenant isolation
- Response follows ApiResponse<T> wrapper pattern

---

### Story 12.4: Workflow Tasks Frontend Panel

As a user,
I want to see workflow task progress in a panel,
So that I can monitor autonomous workflow execution in real-time.

**Acceptance Criteria:**

**Given** an autonomous workflow is running
**When** viewing the workflow tasks panel
**Then** I see list of tasks with:
  - Task name
  - Status indicator (pending/in_progress/completed/failed)
  - Progress bar (0-100%)
  - Duration (started → completed or current)

**Given** a task status changes
**When** WebSocket event is received
**Then** panel updates in real-time without refresh
**And** status indicator animates transition

**Given** a task fails
**When** viewing failed task
**Then** I see error message (user-friendly)
**And** can expand to see error details
**And** red status indicator is shown

**Given** all tasks complete
**When** workflow finishes
**Then** summary is shown: total time, tasks completed
**And** success celebration animation (subtle)

**Technical Notes:**
- Angular component: workflow-tasks-panel
- Uses Angular Signals for reactive updates
- WebSocket service listens for workflow.task.* events

---

## Epic 13: Risk Classification

**Goal:** Implement hybrid risk classification system where rules execute first and AI can only increase (never decrease) risk levels.

**Dependencies:** Epic 11 (LLM Tenant Isolation), Epic 12 (Workflow Engine)
**Architecture Reference:** autonomous-business-brain-architecture.md - Risk Classification Rules

---

### Story 13.1: Risk Rules Engine

As a developer,
I want a rules-based risk classification engine,
So that common risk patterns are caught consistently without AI overhead.

**Acceptance Criteria:**

**Given** a task needs risk classification
**When** RiskClassifier.classify(task) is called
**Then** rules are evaluated in order
**And** first matching rule determines base risk level
**And** rule match is logged for audit

**Given** risk rules exist
**When** evaluating a task
**Then** rules check for:
  - Financial thresholds (> $10K = HIGH)
  - Legal/compliance keywords (REQUIRES_APPROVAL)
  - External data access (MEDIUM minimum)
  - User data modification (MEDIUM minimum)

**Given** no rules match
**When** classification completes
**Then** default risk level is LOW
**And** proceeds to AI assessment

**Technical Notes:**
- RiskLevel enum: LOW, MEDIUM, HIGH, REQUIRES_APPROVAL
- Rules defined in configuration (not hardcoded)
- Each rule: { name, condition, riskLevel, description }

---

### Story 13.2: AI Risk Assessment Layer

As a developer,
I want an AI risk assessment that can increase (not decrease) risk levels,
So that nuanced risks are caught while maintaining rule consistency.

**Acceptance Criteria:**

**Given** rules-based classification completed
**When** AI assessment is invoked
**Then** LLM analyzes task context for risks
**And** returns confidence score (0-100%)
**And** returns suggested risk level

**Given** AI suggests higher risk than rules
**When** confidence > 85%
**Then** risk level is increased to AI suggestion
**And** reasoning is logged for audit

**Given** AI suggests lower risk than rules
**When** any confidence level
**Then** risk level remains at rules-based level
**And** AI suggestion is logged but not applied

**Given** AI confidence is < 85%
**When** AI suggests higher risk
**Then** risk level remains at rules-based level
**And** flagged for human review

**Technical Notes:**
- 85% confidence threshold (configurable)
- AI can only bump UP, never down
- Full audit trail: rule match + AI confidence + final decision

---

### Story 13.3: Risk-Based Workflow Routing

As a user,
I want tasks routed based on risk classification,
So that high-risk tasks require my approval before execution.

**Acceptance Criteria:**

**Given** task is classified as LOW or MEDIUM
**When** workflow processes task
**Then** task executes automatically
**And** user is notified of completion

**Given** task is classified as HIGH
**When** workflow reaches task
**Then** workflow pauses
**And** user is notified: "High-risk task requires review"
**And** task details and risk reasoning are shown

**Given** task is classified as REQUIRES_APPROVAL
**When** workflow reaches task
**Then** workflow pauses
**And** user must explicitly approve or reject
**And** approval is logged with timestamp and user

**Given** user approves high-risk task
**When** approval submitted
**Then** workflow continues with task execution
**And** approval audit trail is recorded

**Given** user rejects high-risk task
**When** rejection submitted
**Then** workflow handles rejection gracefully
**And** alternative path is offered if available

**Technical Notes:**
- Approval stored: { taskId, userId, decision, timestamp, reason? }
- WebSocket notification for approval requests
- Timeout after 24 hours → escalate to tenant owner

---

## Epic 14: Concept Seeding & Hierarchy

**Goal:** Seed 500+ Serbian business concepts with proper hierarchy relationships and implement cross-language semantic search.

**Dependencies:** Epic 10 (Schema Migration)
**Architecture Reference:** autonomous-business-brain-architecture.md - Serbian Concept Architecture

---

### Story 14.1: Hierarchy Code Parser

As a developer,
I want a hierarchy code parser that derives parent-child relationships,
So that concepts are automatically organized into a tree structure.

**Acceptance Criteria:**

**Given** a concept with hierarchyCode "2.1.1"
**When** parser processes the concept
**Then** parentId is set to concept with hierarchyCode "2.1"
**And** if parent doesn't exist, parent is created first

**Given** a concept with hierarchyCode "1"
**When** parser processes the concept
**Then** parentId is null (top-level concept)

**Given** hierarchy codes in seed data
**When** processing seed file
**Then** concepts are created in order (parents before children)
**And** relationships are properly established

**Given** invalid hierarchy code
**When** validation runs
**Then** error is logged with concept details
**And** concept is skipped (not inserted)

**Technical Notes:**
- Hierarchy code pattern: `/^(\d+\.)*\d+$/`
- Parent derivation: "2.1.1" → "2.1" → "2" → null
- Process in sorted order by hierarchy code length

---

### Story 14.2: Serbian Concept Seed Data

As a content administrator,
I want to load 500+ Serbian business concepts from seed file,
So that the knowledge base includes multilingual content.

**Acceptance Criteria:**

**Given** seed file exists at data/seeds/serbian-concepts/concepts.json
**When** seed command runs
**Then** all concepts are inserted with:
  - language: "sr"
  - hierarchyCode from numbering
  - knowledgeDomain from category
  - sourceVersion: "serbian-hierarchy-v1-2026-02-06"
  - BGE-M3 embeddings generated

**Given** seed has already run
**When** re-running seed
**Then** existing concepts are updated (not duplicated)
**And** sourceVersion is updated
**And** embeddings are regenerated if content changed

**Given** concept belongs to domain
**When** mapping to persona category
**Then** domain → category mapping is applied:
  - Vrednost, Cene, Finansije → FINANCE
  - Marketing, Psihologija → MARKETING
  - Prodaja, Razvoj Poslovanja → MARKETING
  - Operacije, Isporuka, Sistemi → OPERATIONS
  - Menadžment, HR → OPERATIONS
  - Struktura, Vlasništvo, M&A → LEGAL
  - Poslovni Modeli, Startup → CREATIVE

**Technical Notes:**
- Seed file: flat JSON with hierarchy codes
- BGE-M3 embeddings for multilingual semantic search
- Batch processing for performance (100 concepts per batch)

---

### Story 14.3: Cross-Language Semantic Search

As a user,
I want to search concepts in any language and get relevant results,
So that I can find knowledge regardless of language barriers.

**Acceptance Criteria:**

**Given** user searches "SWOT analysis" in English
**When** semantic search executes
**Then** results include:
  - "SWOT Analysis" (en)
  - "SWOT Analiza" (sr)
**And** results ranked by semantic similarity

**Given** user searches "цене" (prices) in Serbian
**When** semantic search executes
**Then** results include Serbian pricing concepts
**And** may include English pricing concepts if semantically similar

**Given** optional language filter is provided
**When** GET /api/concepts?q=:query&lang=sr
**Then** only Serbian concepts are returned
**And** semantic matching still applies

**Given** no language filter
**When** search executes
**Then** all languages are searched
**And** results merged and ranked by relevance

**Technical Notes:**
- BGE-M3 handles cross-language matching automatically
- No explicit ID mapping between languages needed
- Optional lang parameter in search API

---

### Story 14.4: Concept Staleness Detection

As a system administrator,
I want to detect when concepts may be stale,
So that agents are warned about potentially outdated knowledge.

**Acceptance Criteria:**

**Given** concepts have sourceVersion field
**When** agent retrieves concepts
**Then** sourceVersion is compared to current KB version
**And** if mismatch, staleness flag is set

**Given** concepts are flagged as stale
**When** building agent context
**Then** staleness warning is included:
  - "Some concepts may be from older KB version"
  - List of stale concept IDs
**And** agent can still use concepts but with caution

**Given** knowledge base is updated
**When** new concepts are seeded
**Then** sourceVersion is updated globally
**And** existing concepts without update are marked potentially stale

**Technical Notes:**
- Current KB version stored in platform config
- Staleness check happens at retrieval time
- Warning included in TenantContextBuilder output

---

## Epic 15: Market Signals

**Goal:** Implement market signal source management with circuit breaker resilience pattern.

**Dependencies:** Epic 10 (Schema Migration), Epic 11 (LLM Tenant Isolation)
**Architecture Reference:** autonomous-business-brain-architecture.md - Circuit Breaker Pattern

---

### Story 15.1: Signal Source Management API

As a tenant owner,
I want to configure market signal sources,
So that the system can fetch relevant market data for my business.

**Acceptance Criteria:**

**Given** I want to add a signal source
**When** POST /api/signals/sources with { url, name, category }
**Then** SignalSource is created for my tenant
**And** URL is validated (reachable, allowed domain)
**And** unique constraint prevents duplicate URLs per tenant

**Given** I want to list my signal sources
**When** GET /api/signals/sources
**Then** all sources for my tenant are returned
**And** includes: name, url, category, isActive, failureCount, lastFetched

**Given** I want to update a signal source
**When** PATCH /api/signals/sources/:id
**Then** name and category can be updated
**And** URL cannot be changed (delete and recreate)

**Given** I want to delete a signal source
**When** DELETE /api/signals/sources/:id
**Then** source is removed
**And** associated signals are retained (orphaned but queryable)

**Technical Notes:**
- URL validation: HEAD request to verify reachable
- Category enum: INDUSTRY_NEWS, COMPETITOR, MARKET_DATA, REGULATORY, CUSTOM
- Tenant isolation via TenantGuard middleware

---

### Story 15.2: Circuit Breaker Implementation

As a developer,
I want automatic circuit breaker protection for signal sources,
So that failing sources don't impact system performance.

**Acceptance Criteria:**

**Given** signal source fetch succeeds
**When** processing response
**Then** failureCount is reset to 0
**And** lastFetched is updated

**Given** signal source fetch fails
**When** processing error
**Then** failureCount is incremented
**And** error is logged with details

**Given** failureCount reaches 3
**When** next failure is recorded
**Then** isActive is set to false
**And** disabledAt is set to current timestamp
**And** disabledReason is set to "circuit_breaker"
**And** user notification is sent: "Signal source disabled due to failures"

**Given** source is auto-disabled
**When** user views source
**Then** they see disabled status with reason
**And** can manually reset via API

**Given** user requests manual reset
**When** POST /api/signals/sources/:id/reset
**Then** failureCount is reset to 0
**And** isActive is set to true
**And** disabledAt and disabledReason are cleared

**Technical Notes:**
- Circuit breaker states: CLOSED (normal), OPEN (disabled)
- Future enhancement: HALF_OPEN for recovery testing
- Notification via existing notification system

---

### Story 15.3: Signal Fetcher Service

As a developer,
I want a service that fetches signals from configured sources,
So that market data is collected automatically.

**Acceptance Criteria:**

**Given** active signal sources exist
**When** fetch scheduler runs
**Then** each active source is fetched
**And** rate limiting is applied (respect robots.txt)
**And** content is sanitized (strip scripts/iframes)

**Given** fetch returns new content
**When** processing content
**Then** signal is parsed and stored
**And** tenant is notified of new signal
**And** WebSocket event "signal.received" is emitted

**Given** fetch encounters error
**When** circuit breaker is not open
**Then** failureCount is incremented
**And** retry scheduled with exponential backoff

**Given** content sanitization runs
**When** processing HTML
**Then** script tags are removed
**And** iframe tags are removed
**And** external resource links are validated against allowlist

**Technical Notes:**
- Fetch interval: configurable per category (default 4hr/1hr)
- Content sanitization using DOMPurify or similar
- URL allowlist for external resources

---

### Story 15.4: Signals Frontend Panel

As a user,
I want to view market signals in a dedicated panel,
So that I can stay informed about relevant market developments.

**Acceptance Criteria:**

**Given** I have signal sources configured
**When** viewing signals panel
**Then** I see recent signals grouped by category
**And** each signal shows: title, source, timestamp, summary

**Given** a new signal arrives
**When** WebSocket event is received
**Then** panel updates in real-time
**And** new signal is highlighted briefly

**Given** I want to manage sources
**When** clicking "Manage Sources"
**Then** source configuration dialog opens
**And** I can add, edit, delete sources

**Given** a source is disabled
**When** viewing sources
**Then** disabled source shows warning icon
**And** shows reason and "Reset" button

**Technical Notes:**
- Angular component: signals-panel
- Real-time updates via WebSocket
- Source config dialog: source-config-dialog component

---

## Epic 16: Extension Frontend Integration

**Goal:** Integrate all extension features into the existing Mentor AI frontend with consistent UX patterns.

**Dependencies:** Epics 10-15 (all extension backend)
**Architecture Reference:** autonomous-business-brain-architecture.md - Project Structure

---

### Story 16.1: Concept Hierarchy Browser

As a user,
I want to browse concepts in a hierarchical tree view,
So that I can explore knowledge base structure intuitively.

**Acceptance Criteria:**

**Given** concepts have parent-child relationships
**When** viewing concept browser
**Then** tree structure is displayed
**And** expand/collapse nodes to navigate
**And** click node to view concept details

**Given** viewing a concept
**When** it has children
**Then** children are listed below details
**And** breadcrumb shows path to root

**Given** searching in browser
**When** entering search term
**Then** matching concepts are highlighted
**And** tree expands to show matches

**Technical Notes:**
- Angular component: concept-hierarchy-tree
- Lazy loading for deep hierarchies
- Keyboard navigation support

---

### Story 16.2: Extension WebSocket Events

As a frontend developer,
I want WebSocket events for all extension features,
So that UI updates in real-time.

**Acceptance Criteria:**

**Given** workflow task status changes
**When** event is emitted
**Then** event follows pattern: workflow.task.{action}
**And** payload includes: tenantId, workflowId, taskId, status, progress?, timestamp

**Given** signal is received
**When** event is emitted
**Then** event is: signal.received
**And** payload includes: tenantId, signalId, sourceId, title, timestamp

**Given** signal source is disabled
**When** circuit breaker opens
**Then** event is: signal.source.disabled
**And** payload includes: tenantId, sourceId, reason, timestamp

**Given** concept staleness detected
**When** stale concepts found
**Then** event is: concept.staleness.detected
**And** payload includes: tenantId, conceptIds[], sourceVersion

**Technical Notes:**
- All events include tenantId for client-side filtering
- Timestamp in ISO 8601 format
- WebSocket service extended for new event types

---

### Story 16.3: Extension Navigation Integration

As a user,
I want extension features accessible from main navigation,
So that new capabilities are discoverable.

**Acceptance Criteria:**

**Given** extension features are enabled
**When** viewing sidebar
**Then** new items appear:
  - "Workflows" (links to workflow list)
  - "Signals" (links to signals panel)
  - "Concepts" (links to concept browser)

**Given** workflow is running
**When** viewing sidebar
**Then** "Workflows" shows badge with running count

**Given** new signals arrived
**When** viewing sidebar
**Then** "Signals" shows badge with unread count

**Technical Notes:**
- Conditional rendering based on feature flags
- Badge uses Angular Signals for reactivity
- Routes added to existing Angular router

---

### Story 16.4: Extension Settings

As a tenant owner,
I want to configure extension features,
So that I can customize behavior for my organization.

**Acceptance Criteria:**

**Given** I access tenant settings
**When** viewing extension settings section
**Then** I see configuration options:
  - Workflow timeout (default: 10 min)
  - Risk approval email notifications (on/off)
  - Signal fetch frequency (4hr/1hr/custom)
  - Concept language preference (en/sr/both)

**Given** I update settings
**When** saving changes
**Then** settings are persisted for tenant
**And** confirmation is shown
**And** changes take effect immediately

**Technical Notes:**
- Settings stored in tenant configuration
- Angular reactive forms for settings UI
- Validation for custom values

---

## Extension Epic Summary

| Epic | Stories | Focus Area |
|------|---------|------------|
| Epic 10 | 4 | Schema Migration & Foundation |
| Epic 11 | 3 | LLM Tenant Isolation |
| Epic 12 | 4 | Workflow Engine |
| Epic 13 | 3 | Risk Classification |
| Epic 14 | 4 | Concept Seeding & Hierarchy |
| Epic 15 | 4 | Market Signals |
| Epic 16 | 4 | Extension Frontend Integration |

**Total Extension Stories:** 28
**Implementation Sequence:** Epics 10 → 11 → 12 → 13 → 14 → 15 → 16

**Cross-Epic Dependencies:**
```
Epic 10 (Schema) → Epic 11 (LLM Isolation) → Epic 12 (Workflows)
                                          → Epic 13 (Risk)
                 → Epic 14 (Concepts)
                 → Epic 15 (Signals)

All Backend → Epic 16 (Frontend Integration)
```

---

_Extension epics added: 2026-02-06_
_Source: autonomous-business-brain-architecture.md_

