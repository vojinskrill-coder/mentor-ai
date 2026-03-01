/**
 * Shared TypeScript interfaces for Mentor AI
 * These types are used across both frontend (Angular) and backend (NestJS)
 */
/** Base entity with common fields */
export interface BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}
/** API response wrapper */
export interface ApiResponse<T> {
    data: T;
    message?: string;
    success: boolean;
}
/** Pagination metadata */
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
/** Paginated response */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    meta: PaginationMeta;
}
/** User entity */
export interface User extends BaseEntity {
    email: string;
    displayName: string;
    avatarUrl?: string;
}
/** Error response */
export interface ApiError {
    statusCode: number;
    message: string;
    error?: string;
}
/** Invitation status */
export declare enum InvitationStatus {
    PENDING = "PENDING",
    ACCEPTED = "ACCEPTED",
    EXPIRED = "EXPIRED",
    REVOKED = "REVOKED"
}
/** Department assignment */
export declare enum Department {
    FINANCE = "FINANCE",
    MARKETING = "MARKETING",
    TECHNOLOGY = "TECHNOLOGY",
    OPERATIONS = "OPERATIONS",
    LEGAL = "LEGAL",
    CREATIVE = "CREATIVE",
    STRATEGY = "STRATEGY",
    SALES = "SALES"
}
/** Full list of industries for onboarding */
export declare const INDUSTRIES: readonly ["Accounting & Finance", "Agriculture", "Automotive", "Construction & Real Estate", "Consulting", "Education", "Energy & Utilities", "Entertainment & Media", "Food & Beverage", "Government", "Healthcare", "Hospitality & Tourism", "Insurance", "Legal Services", "Manufacturing", "Non-Profit", "Professional Services", "Retail & E-Commerce", "SaaS & Technology", "Telecommunications", "Transportation & Logistics", "Other"];
export type Industry = (typeof INDUSTRIES)[number];
/** Invitation entity */
export interface Invitation extends BaseEntity {
    email: string;
    department: Department;
    role: string;
    status: InvitationStatus;
    token: string;
    expiresAt: Date;
    tenantId: string;
    invitedById: string;
    acceptedByUserId?: string | null;
}
/** Create invitation request */
export interface CreateInvitationRequest {
    email: string;
    department: Department;
}
/** Invitation response from API */
export interface InvitationResponse extends Invitation {
    tenantName?: string;
    invitedByEmail?: string;
}
/** Team member removal strategy */
export type RemovalStrategy = 'REASSIGN' | 'ARCHIVE';
/** Remove member request body */
export interface RemoveMemberRequest {
    strategy: RemovalStrategy;
}
/** Team member response for listing active members */
export interface TeamMemberResponse {
    id: string;
    email: string;
    name: string | null;
    role: string;
    department: string | null;
    createdAt: Date;
}
/** Backup owner response */
export interface BackupOwnerResponse {
    id: string;
    email: string;
    name: string | null;
    designatedAt: string;
}
/** Request to designate a backup owner */
export interface DesignateBackupOwnerRequest {
    backupOwnerId: string;
}
/** Backup owner status for warning banner check */
export interface BackupOwnerStatus {
    hasBackupOwner: boolean;
    tenantAgeDays: number;
    showWarning: boolean;
}
/** Recovery result */
export interface RecoveryResult {
    recoveredUserId: string;
    message: string;
}
/** Export format options */
export declare enum ExportFormat {
    PDF = "PDF",
    MARKDOWN = "MARKDOWN",
    JSON = "JSON"
}
/** Export status tracking */
export declare enum ExportStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    EXPIRED = "EXPIRED"
}
/** Request to initiate a data export */
export interface DataExportRequest {
    format: ExportFormat;
    dataTypes: string[];
}
/** Single data export record response */
export interface DataExportResponse {
    exportId: string;
    status: ExportStatus;
    format: ExportFormat;
    dataTypes: string[];
    fileSize: number | null;
    requestedAt: string;
    completedAt: string | null;
    expiresAt: string | null;
    downloadUrl: string | null;
}
/** Section of collected export data */
export interface ExportDataSection {
    key: string;
    title: string;
    items: Record<string, unknown>[];
    itemCount: number;
}
/** Tenant status tracking */
export declare enum TenantStatus {
    DRAFT = "DRAFT",
    ONBOARDING = "ONBOARDING",
    ACTIVE = "ACTIVE",
    SUSPENDED = "SUSPENDED",
    PENDING_DELETION = "PENDING_DELETION",
    DELETED = "DELETED"
}
/** Request to initiate tenant deletion */
export interface TenantDeletionRequest {
    workspaceName: string;
}
/** Tenant deletion status response */
export interface TenantDeletionStatusResponse {
    status: TenantStatus;
    requestedAt: string | null;
    gracePeriodEndsAt: string | null;
    estimatedCompletionBy: string | null;
    canCancel: boolean;
    /** Tenant name for type-to-confirm validation */
    tenantName?: string;
    /** Number of active team members who will lose access */
    memberCount?: number;
}
/** Response after initiating tenant deletion */
export interface TenantDeletionResponse {
    data: TenantDeletionStatusResponse;
    message: string;
}
/** LLM provider types supported by the platform */
export declare enum LlmProviderType {
    OPENROUTER = "OPENROUTER",
    LOCAL_LLAMA = "LOCAL_LLAMA",
    OPENAI = "OPENAI",
    ANTHROPIC = "ANTHROPIC",
    LM_STUDIO = "LM_STUDIO",
    DEEPSEEK = "DEEPSEEK"
}
/** Single LLM provider configuration */
export interface LlmProviderConfig {
    id: string;
    providerType: LlmProviderType;
    apiKey?: string;
    endpoint?: string;
    modelId: string;
    isPrimary: boolean;
    isFallback: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
/** Model information from provider */
export interface LlmModelInfo {
    id: string;
    name: string;
    costPer1kTokens: number | null;
    contextLength?: number;
}
/** Resource requirements for local LLM */
export interface LlmResourceInfo {
    gpuRequired: boolean;
    gpuMemoryGb?: number;
    cpuCores?: number;
    ramGb?: number;
}
/** Provider validation status/result */
export interface LlmProviderStatus {
    valid: boolean;
    models: LlmModelInfo[];
    resourceInfo: LlmResourceInfo | null;
    errorMessage?: string;
}
/** Single provider configuration for update request */
export interface LlmProviderUpdatePayload {
    type: LlmProviderType;
    apiKey?: string;
    endpoint?: string;
    modelId: string;
}
/** Request to update LLM configuration */
export interface LlmConfigUpdateRequest {
    primaryProvider: LlmProviderUpdatePayload;
    fallbackProvider?: LlmProviderUpdatePayload | null;
}
/** Response containing current LLM configuration */
export interface LlmConfigResponse {
    primaryProvider: LlmProviderConfig | null;
    fallbackProvider: LlmProviderConfig | null;
}
/** Request to validate a provider's credentials */
export interface LlmValidateProviderRequest {
    type: LlmProviderType;
    apiKey?: string;
    endpoint?: string;
}
/** Response from provider validation */
export interface LlmValidateProviderResponse {
    data: LlmProviderStatus;
}
/** Audit log entry for LLM config changes */
export interface LlmConfigAuditLogEntry {
    id: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    changedBy: string;
    previousVal: Record<string, unknown> | null;
    newVal: Record<string, unknown>;
    createdAt: string;
}
/** Message role in conversation */
export declare enum MessageRole {
    USER = "USER",
    ASSISTANT = "ASSISTANT"
}
/** Chat conversation session */
export interface Conversation {
    id: string;
    userId: string;
    title: string | null;
    personaType: PersonaType | null;
    conceptId: string | null;
    conceptName?: string | null;
    conceptCategory?: string | null;
    createdAt: string;
    updatedAt: string;
}
/** Individual chat message */
export interface Message {
    id: string;
    conversationId: string;
    role: MessageRole;
    content: string;
    /** Confidence score for AI messages (0.0-1.0), null for user messages */
    confidenceScore: number | null;
    /** Confidence factor breakdown for AI messages */
    confidenceFactors: ConfidenceFactor[] | null;
    /** Concept citations in this message (Story 2.6) */
    citations?: ConceptCitation[];
    /** Memory attributions for context references (Story 2.7) */
    memoryAttributions?: MemoryAttribution[];
    /** Web search source URLs used for this AI response (Story 3.11) */
    webSearchSources?: WebSearchSource[];
    /** Suggested next actions after this AI response (D1) */
    suggestedActions?: SuggestedAction[];
    /** File attachments on this message */
    attachments?: AttachmentItem[];
    createdAt: string;
}
/** Web search source reference displayed under AI messages (Story 3.11) */
export interface WebSearchSource {
    title: string;
    link: string;
}
/** File attachment metadata for display in chat and tasks */
export interface AttachmentItem {
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: string;
}
/** Conversation with messages included */
export interface ConversationWithMessages extends Conversation {
    messages: Message[];
}
/** Request to create a new conversation */
export interface CreateConversationRequest {
    title?: string;
    personaType?: PersonaType;
    conceptId?: string;
}
/** Curriculum node from reference JSON */
export interface CurriculumNode {
    id: string;
    parentId: string | null;
    label: string;
    sortOrder: number;
}
/** Hierarchical concept tree node (for sidebar) */
export interface ConceptHierarchyNode {
    curriculumId: string;
    label: string;
    conceptId?: string;
    children: ConceptHierarchyNode[];
    conversationCount: number;
    conversations: Conversation[];
    /** Brain tree status: 'completed' | 'pending' (from task note status) */
    status?: 'completed' | 'pending';
    /** User who completed this concept's task */
    completedByUserId?: string;
    /** Note ID for pending task (for "Istraži" action) */
    pendingNoteId?: string;
    /** Conversation ID linked to this concept (for "Pogledaj" navigation) */
    linkedConversationId?: string;
}
/** Full concept tree structure for sidebar */
export interface ConceptTreeData {
    tree: ConceptHierarchyNode[];
    uncategorized: Conversation[];
}
/** @deprecated Use ConceptHierarchyNode instead */
export interface ConceptTreeCategory {
    category: string;
    concepts: ConceptTreeNode[];
}
/** @deprecated Use ConceptHierarchyNode instead */
export interface ConceptTreeNode {
    conceptId: string;
    conceptName: string;
    conversations: Conversation[];
}
/** Response for single conversation */
export interface ConversationResponse {
    data: ConversationWithMessages;
}
/** Response for conversation list */
export interface ConversationsListResponse {
    data: Conversation[];
}
/** Request to send a message in a conversation */
export interface SendMessageRequest {
    content: string;
}
/** WebSocket event: Client sends message to server */
export interface ChatMessageSend {
    conversationId: string;
    content: string;
}
/** WebSocket event: Server streams message chunk to client */
export interface ChatMessageChunk {
    content: string;
    index: number;
}
/** WebSocket event: Server signals message completion */
export interface ChatComplete {
    messageId: string;
    fullContent: string;
    metadata?: Record<string, unknown>;
}
/** Suggested action after AI response (D1) */
export interface SuggestedAction {
    type: 'create_tasks' | 'run_workflow' | 'explore_concept' | 'deep_dive' | 'next_domain' | 'score_task' | 'view_tasks' | 'save_note' | 'web_search';
    label: string;
    icon: 'tasks' | 'workflow' | 'explore' | 'search' | 'arrow' | 'score' | 'note' | 'web';
    payload?: Record<string, unknown>;
}
/** Chat message format for AI conversations */
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
/** Time period for usage queries */
export type UsagePeriod = 'day' | 'week' | 'month' | 'all';
/** Rate limit headers for HTTP responses */
export interface RateLimitHeaders {
    'X-RateLimit-Limit': string;
    'X-RateLimit-Remaining': string;
    'X-RateLimit-Reset': string;
    'Retry-After'?: string;
}
/** Pricing structure for a model */
export interface ModelPricing {
    /** Cost per 1000 input tokens in USD */
    input: number;
    /** Cost per 1000 output tokens in USD */
    output: number;
}
/** Cost calculation result */
export interface CostCalculation {
    /** Cost for input tokens */
    inputCost: number;
    /** Cost for output tokens */
    outputCost: number;
    /** Total cost */
    totalCost: number;
    /** Model ID used for calculation */
    modelId: string;
    /** Whether pricing was found for the model */
    pricingFound: boolean;
}
/** Circuit breaker status information */
export interface CircuitBreakerStatus {
    state: CircuitBreakerState;
    failures: number;
    lastFailure?: number;
    lastSuccess?: number;
    openedAt?: number;
}
/** Circuit breaker event for monitoring (alias for SystemCircuitBreaker) */
export type CircuitBreakerEvent = SystemCircuitBreaker;
/** Token usage record for tracking AI consumption */
export interface TokenUsage {
    id: string;
    tenantId: string;
    userId: string;
    conversationId?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    modelId: string;
    providerId?: string;
    createdAt: string;
}
/** Aggregated usage summary for reporting */
export interface UsageSummary {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    requestCount: number;
}
/** Rate limit information for responses */
export interface RateLimitInfo {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Maximum requests allowed in the window */
    limit: number;
    /** Remaining requests in the current window */
    remaining: number;
    /** Unix timestamp when the rate limit resets */
    reset: number;
    /** Retry-After value in seconds (only present when rate limited) */
    retryAfter?: number;
    /** Type of limit that was exceeded (tenant or user) */
    limitType?: 'tenant' | 'user';
}
/** Quota status for a tenant */
export interface QuotaStatus {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Remaining tokens in quota */
    remaining: number;
    /** Total quota limit */
    limit: number;
    /** Tokens used so far */
    used: number;
    /** Percentage of quota used (0-100) */
    percentUsed: number;
}
/** Circuit breaker states */
export declare enum CircuitBreakerState {
    /** Normal operation - requests flow through */
    CLOSED = "CLOSED",
    /** Circuit tripped - all requests rejected */
    OPEN = "OPEN",
    /** Testing - allow one request to check if service recovered */
    HALF_OPEN = "HALF_OPEN"
}
/** WebSocket event: Queue position update */
export interface ChatQueuePosition {
    position: number;
    estimatedWait: number;
    requestId: string;
}
/** WebSocket event: Circuit breaker state change */
export interface SystemCircuitBreaker {
    eventId: string;
    providerId: string;
    previousState: CircuitBreakerState;
    newState: CircuitBreakerState;
    failures: number;
    timestamp: number;
    /** Correlation ID for request tracing */
    correlationId?: string;
}
/** Persona type for department-specific AI responses */
export declare enum PersonaType {
    CFO = "CFO",
    CMO = "CMO",
    CTO = "CTO",
    OPERATIONS = "OPERATIONS",
    LEGAL = "LEGAL",
    CREATIVE = "CREATIVE",
    CSO = "CSO",
    SALES = "SALES"
}
/**
 * Persona colors for UI theming (dark mode compatible).
 * Single source of truth for persona color values.
 */
export declare const PERSONA_COLORS: Record<PersonaType, string>;
/**
 * Persona display names for UI.
 * Single source of truth for persona short names.
 */
export declare const PERSONA_NAMES: Record<PersonaType, string>;
/** Department persona definition */
export interface Persona {
    /** Unique persona identifier with prs_ prefix */
    id: string;
    /** Persona type enum value */
    type: PersonaType;
    /** Full persona name (e.g., "Chief Financial Officer") */
    name: string;
    /** Short name (e.g., "CFO") */
    shortName: string;
    /** Brief description of the persona's expertise */
    description: string;
    /** Path to the persona's avatar image */
    avatarUrl: string;
    /** Hex color code for UI theming */
    color: string;
}
/** Persona system prompt configuration */
export interface PersonaSystemPrompt {
    /** Persona type */
    type: PersonaType;
    /** System prompt for AI context (~500 tokens) */
    systemPrompt: string;
    /** List of capabilities */
    capabilities: string[];
    /** List of limitations */
    limitations: string[];
}
/** Request to update conversation persona */
export interface UpdatePersonaRequest {
    /** Persona type to set */
    personaType: PersonaType;
}
/** Response containing all available personas */
export interface PersonasListResponse {
    data: Persona[];
}
/** Response containing single persona */
export interface PersonaResponse {
    data: Persona;
}
/** Confidence level thresholds */
export declare enum ConfidenceLevel {
    /** High confidence: 85-100% */
    HIGH = "HIGH",
    /** Medium confidence: 50-84% */
    MEDIUM = "MEDIUM",
    /** Low confidence: 0-49% */
    LOW = "LOW"
}
/**
 * Confidence level colors for UI theming.
 * Single source of truth for confidence indicator colors.
 */
export declare const CONFIDENCE_COLORS: Record<ConfidenceLevel, string>;
/** Individual factor contributing to confidence score */
export interface ConfidenceFactor {
    /** Factor identifier (e.g., "hedging_language", "context_depth") */
    name: string;
    /** Factor score (0.0-1.0) */
    score: number;
    /** Factor contribution weight (should sum to 1.0 across all factors) */
    weight: number;
    /** Human-readable description of what this factor measures */
    description?: string;
}
/** Complete confidence score with factor breakdown */
export interface ConfidenceScore {
    /** Overall confidence score (0.0-1.0, display as percentage) */
    score: number;
    /** Categorized confidence level */
    level: ConfidenceLevel;
    /** Breakdown of individual factors */
    factors: ConfidenceFactor[];
    /** Actionable suggestion to improve confidence */
    improvementSuggestion?: string;
    /** Previous score for showing improvement delta */
    previousScore?: number;
}
/** Improvement suggestion for low confidence responses */
export interface ImprovementSuggestion {
    /** Category of missing context (e.g., "missing_context", "ambiguous_question") */
    category: string;
    /** User-facing actionable suggestion text */
    suggestion: string;
    /** Priority ranking (1 = highest) */
    priority: number;
}
/** Context for confidence calculation */
export interface ConfidenceContext {
    /** Number of messages in conversation history */
    messageCount: number;
    /** Whether client/project context is available */
    hasClientContext: boolean;
    /** Whether specific data points were provided */
    hasSpecificData: boolean;
    /** Active persona type */
    personaType?: PersonaType;
    /** User's original question */
    userQuestion: string;
}
/** Quick task for onboarding wizard */
export interface QuickTask {
    /** Unique task identifier */
    id: string;
    /** Display name for the task */
    name: string;
    /** Brief description of what the task produces */
    description: string;
    /** Department this task is associated with */
    department: Department;
    /** Estimated time this task saves the user (in minutes) */
    estimatedTimeSaved: number;
}
/** Onboarding wizard status */
export interface OnboardingStatus {
    /** Current wizard step (1, 2, 3, or 'complete') */
    currentStep: 1 | 2 | 3 | 'complete';
    /** Current tenant status */
    tenantStatus: TenantStatus;
    /** Selected industry/department from step 1 */
    selectedIndustry?: string;
    /** Selected task ID from step 2 */
    selectedTaskId?: string;
    /** Timestamp when onboarding started (ISO string) */
    startedAt?: string;
}
/** Request to execute quick win task */
export interface QuickWinRequest {
    /** Selected task ID */
    taskId: string;
    /** User-provided context for the task (max 280 chars) */
    userContext: string;
    /** Selected industry/department */
    industry: string;
}
/** Response from quick win execution */
export interface QuickWinResponse {
    /** Generated AI output */
    output: string;
    /** Time taken to generate (in milliseconds) */
    generationTimeMs: number;
    /** Token usage for this request */
    tokensUsed: number;
}
/** Request to complete onboarding and save first note */
export interface OnboardingCompleteRequest {
    /** Selected task ID */
    taskId: string;
    /** User-provided context */
    userContext: string;
    /** Selected industry */
    industry: string;
    /** Generated output to save as note */
    generatedOutput: string;
}
/** Response after completing onboarding */
export interface OnboardingCompleteResponse {
    /** Saved note content */
    output: string;
    /** Estimated time saved (in minutes) */
    timeSavedMinutes: number;
    /** ID of the saved note (if applicable) */
    noteId?: string;
    /** Celebration message to display */
    celebrationMessage: string;
    /** New tenant status (should be ACTIVE) */
    newTenantStatus: TenantStatus;
    /** ID of the welcome conversation created with task list */
    welcomeConversationId?: string;
    /** Execution mode selected during onboarding */
    executionMode?: ExecutionMode;
    /** Pre-built execution plan ID (generated during onboarding) */
    planId?: string;
}
/** Onboarding metric for analytics */
export interface OnboardingMetricResponse {
    /** Metric record ID */
    id: string;
    /** Tenant ID */
    tenantId: string;
    /** User ID */
    userId: string;
    /** When onboarding started */
    startedAt: string;
    /** When onboarding completed (null if not complete) */
    completedAt: string | null;
    /** Time to first value in milliseconds */
    timeToFirstValueMs: number | null;
    /** Quick task type used */
    quickTaskType: string;
    /** Industry selected */
    industry: string;
}
/** Category for business concepts (matches departments) */
export declare enum ConceptCategory {
    FINANCE = "Finance",
    MARKETING = "Marketing",
    TECHNOLOGY = "Technology",
    OPERATIONS = "Operations",
    LEGAL = "Legal",
    CREATIVE = "Creative",
    STRATEGY = "Strategy",
    SALES = "Sales"
}
/** Relationship type between concepts */
export declare enum RelationshipType {
    /** Must understand this concept first */
    PREREQUISITE = "PREREQUISITE",
    /** Related topic */
    RELATED = "RELATED",
    /** Deeper dive on this topic */
    ADVANCED = "ADVANCED"
}
/** Source tracking for how a concept was created (Story 2.15) */
export declare enum ConceptSource {
    /** Pre-loaded from seed JSON files */
    SEED_DATA = "SEED_DATA",
    /** Created via curriculum tree UI */
    CURRICULUM = "CURRICULUM",
    /** Automatically extracted from AI output */
    AI_DISCOVERED = "AI_DISCOVERED"
}
/** Business concept entity */
export interface Concept {
    /** Unique identifier with cpt_ prefix */
    id: string;
    /** Concept name (unique) */
    name: string;
    /** URL-friendly version of name */
    slug: string;
    /** Category (Finance, Marketing, etc.) */
    category: ConceptCategory;
    /** Brief definition (2-3 sentences) */
    definition: string;
    /** Extended description (full explanation) */
    extendedDescription?: string;
    /** Department tags for filtering */
    departmentTags: string[];
    /** Qdrant vector ID for semantic search */
    embeddingId?: string;
    /** How the concept was created (Story 2.15) */
    source?: ConceptSource;
    /** Version number for tracking updates */
    version: number;
    /** Parent concept ID for hierarchy */
    parentId?: string | null;
    /** Display order among siblings */
    sortOrder?: number;
    /** Links to curriculum.json id */
    curriculumId?: string | null;
    /** Creation timestamp */
    createdAt: string;
    /** Last update timestamp */
    updatedAt: string;
}
/** Relationship between two concepts */
export interface ConceptRelationship {
    /** Unique identifier */
    id: string;
    /** Source concept ID */
    sourceConceptId: string;
    /** Target concept ID */
    targetConceptId: string;
    /** Type of relationship */
    relationshipType: RelationshipType;
    /** Creation timestamp */
    createdAt: string;
}
/** Concept with related concepts included */
export interface ConceptWithRelations extends Concept {
    /** Related concepts from both directions */
    relatedConcepts: Array<{
        /** The related concept */
        concept: Concept;
        /** Type of relationship */
        relationshipType: RelationshipType;
        /** Direction: 'outgoing' if this concept points to it, 'incoming' if it points to this */
        direction: 'outgoing' | 'incoming';
    }>;
}
/** Result of dynamic relationship creation for a newly discovered concept */
export interface DynamicRelationshipResult {
    /** The concept ID relationships were created for */
    conceptId: string;
    /** The concept name */
    conceptName: string;
    /** Number of relationships successfully created */
    relationshipsCreated: number;
    /** Any non-fatal errors encountered */
    errors: string[];
}
/** Result of AI-driven concept extraction from text (Story 2.15) */
export interface ConceptExtractionResult {
    /** Concepts successfully created in the database */
    created: ConceptSummary[];
    /** Concept names that were skipped as duplicates */
    skippedDuplicates: string[];
    /** Non-fatal errors encountered during extraction */
    errors: string[];
}
/** Summary view of a concept for listings and side panels */
export interface ConceptSummary {
    /** Unique identifier with cpt_ prefix */
    id: string;
    /** Concept name */
    name: string;
    /** URL-friendly slug */
    slug: string;
    /** Category */
    category: ConceptCategory;
    /** Brief definition */
    definition: string;
}
/** Seed data format for a single concept */
export interface ConceptSeedData {
    /** Concept name */
    name: string;
    /** URL-friendly slug */
    slug: string;
    /** Category */
    category: string;
    /** Brief definition */
    definition: string;
    /** Extended description */
    extendedDescription?: string;
    /** Department tags */
    departmentTags: string[];
    /** Related concepts with relationship type */
    relatedConcepts?: Array<{
        /** Slug of related concept */
        slug: string;
        /** Type of relationship */
        type: RelationshipType;
    }>;
}
/** Request for listing concepts with optional filters */
export interface ConceptsListRequest {
    /** Filter by category */
    category?: ConceptCategory;
    /** Search query for name/definition */
    search?: string;
    /** Page number (1-indexed) */
    page?: number;
    /** Items per page */
    limit?: number;
}
/** Response for concept listing */
export interface ConceptsListResponse {
    data: ConceptSummary[];
    meta: PaginationMeta;
}
/** Response for single concept with relations */
export interface ConceptResponse {
    data: ConceptWithRelations;
}
/** Response for related concepts of a concept */
export interface ConceptRelationsResponse {
    data: Array<{
        concept: ConceptSummary;
        relationshipType: RelationshipType;
        direction: 'outgoing' | 'incoming';
    }>;
}
/** Citation of a business concept in an AI message */
export interface ConceptCitation {
    /** Unique identifier with cit_ prefix */
    id: string;
    /** Message ID this citation belongs to */
    messageId: string;
    /** Concept ID being cited */
    conceptId: string;
    /** Concept name (denormalized for display) */
    conceptName: string;
    /** Concept category for styling */
    conceptCategory: ConceptCategory;
    /** Character position in message where citation appears */
    position: number;
    /** Semantic similarity score (0.0-1.0) */
    score: number;
    /** Creation timestamp */
    createdAt: string;
}
/** Concept match result from semantic search */
export interface ConceptMatch {
    /** Concept ID */
    conceptId: string;
    /** Concept name */
    conceptName: string;
    /** Concept category */
    category: ConceptCategory;
    /** Concept definition for display */
    definition: string;
    /** Semantic similarity score (0.0-1.0) */
    score: number;
}
/** Result of citation injection into a response */
export interface CitationInjectionResult {
    /** Content with [[Concept Name]] citations injected */
    content: string;
    /** List of citations that were injected */
    citations: ConceptCitation[];
}
/** Response for message citations endpoint */
export interface MessageCitationsResponse {
    data: ConceptCitation[];
}
/** Concept summary for citation side panel */
export interface ConceptCitationSummary {
    /** Concept ID */
    id: string;
    /** Concept name */
    name: string;
    /** Concept category */
    category: ConceptCategory;
    /** Brief definition (2-3 sentences) */
    definition: string;
    /** Full educational content */
    extendedDescription?: string;
    /** Related concepts for exploration */
    relatedConcepts: Array<{
        id: string;
        name: string;
    }>;
}
/** Type of memory stored */
export declare enum MemoryType {
    /** Context about a specific client */
    CLIENT_CONTEXT = "CLIENT_CONTEXT",
    /** Context about a specific project */
    PROJECT_CONTEXT = "PROJECT_CONTEXT",
    /** User preferences and working style */
    USER_PREFERENCE = "USER_PREFERENCE",
    /** General factual statements */
    FACTUAL_STATEMENT = "FACTUAL_STATEMENT"
}
/** Source of the memory */
export declare enum MemorySource {
    /** Automatically extracted from conversation by AI */
    AI_EXTRACTED = "AI_EXTRACTED",
    /** Explicitly stated by user */
    USER_STATED = "USER_STATED",
    /** Corrected by user after AI extraction */
    USER_CORRECTED = "USER_CORRECTED"
}
/**
 * Memory type colors for UI theming.
 * Single source of truth for memory type indicator colors.
 */
export declare const MEMORY_TYPE_COLORS: Record<MemoryType, string>;
/**
 * Memory type display labels.
 * Single source of truth for memory type names.
 */
export declare const MEMORY_TYPE_LABELS: Record<MemoryType, string>;
/** Persistent memory entity */
export interface Memory {
    /** Unique identifier with mem_ prefix */
    id: string;
    /** Tenant ID for isolation */
    tenantId: string;
    /** User ID who owns this memory */
    userId: string;
    /** Type of memory */
    type: MemoryType;
    /** How the memory was created */
    source: MemorySource;
    /** The actual memory content */
    content: string;
    /** Subject name (client, project, or topic) */
    subject?: string;
    /** Extraction/confidence score (0.0-1.0) */
    confidence: number;
    /** Qdrant vector ID for semantic search */
    embeddingId?: string;
    /** Original message this was extracted from */
    sourceMessageId?: string;
    /** Whether this memory has been soft-deleted */
    isDeleted: boolean;
    /** When the memory was deleted (if applicable) */
    deletedAt?: string;
    /** Creation timestamp */
    createdAt: string;
    /** Last update timestamp */
    updatedAt: string;
}
/** Memory attribution displayed in AI responses */
export interface MemoryAttribution {
    /** Memory ID (mem_ prefix) */
    memoryId: string;
    /** Subject name (e.g., "Acme Corp", "Project Phoenix") */
    subject: string;
    /** Brief summary of the memory content */
    summary: string;
    /** Type of memory */
    type: MemoryType;
}
/** Request to create a new memory */
export interface CreateMemoryDto {
    /** Type of memory */
    type: MemoryType;
    /** Source of the memory */
    source: MemorySource;
    /** The memory content */
    content: string;
    /** Subject name (optional) */
    subject?: string;
    /** Confidence score (optional, defaults to 1.0) */
    confidence?: number;
    /** Source message ID (optional) */
    sourceMessageId?: string;
}
/** Request to update/correct a memory */
export interface UpdateMemoryDto {
    /** Updated content */
    content: string;
    /** Source will be set to USER_CORRECTED automatically */
    source?: MemorySource;
}
/** Memory with pagination for list views */
export interface MemoryListResponse {
    data: Memory[];
    meta: {
        total: number;
        limit: number;
        offset: number;
    };
}
/** Response for single memory operations */
export interface MemoryResponse {
    data: Memory;
}
/** Response for memory deletion */
export interface MemoryDeleteResponse {
    success: boolean;
    message: string;
}
/** Request to forget all memories (with confirmation) */
export interface ForgetAllMemoriesRequest {
    /** User must type "FORGET" to confirm */
    confirmation: string;
}
/** Extended completion result with memory attributions */
export interface CompletionResultWithMemory {
    /** The AI response content */
    content: string;
    /** Token usage for this completion */
    tokenUsage: TokenUsage;
    /** Confidence score for the response */
    confidenceScore?: ConfidenceScore;
    /** Memory attributions used in this response */
    memoryAttributions?: MemoryAttribution[];
    /** Concept citations in the response */
    citations?: ConceptCitation[];
}
/** Note type classification */
export declare enum NoteType {
    TASK = "TASK",
    NOTE = "NOTE",
    SUMMARY = "SUMMARY",
    COMMENT = "COMMENT"
}
/** Task completion status */
export declare enum NoteStatus {
    PENDING = "PENDING",
    READY_FOR_REVIEW = "READY_FOR_REVIEW",
    COMPLETED = "COMPLETED"
}
/** Note/task item */
export interface NoteItem {
    id: string;
    title: string;
    content: string;
    source: 'ONBOARDING' | 'CONVERSATION' | 'MANUAL';
    noteType: NoteType;
    status: NoteStatus | null;
    conversationId: string | null;
    conceptId: string | null;
    messageId: string | null;
    createdAt: string;
    updatedAt: string;
    parentNoteId: string | null;
    children?: NoteItem[];
    userReport: string | null;
    aiScore: number | null;
    aiFeedback: string | null;
    expectedOutcome: string | null;
    workflowStepNumber: number | null;
    reusedFromNoteId: string | null;
    /** File attachments on this note/task */
    attachments?: AttachmentItem[];
}
/** Request to create a note */
export interface CreateNoteRequest {
    title: string;
    content: string;
    noteType?: NoteType;
    status?: NoteStatus;
    conversationId?: string;
    conceptId?: string;
}
/** Request to update a note */
export interface UpdateNoteRequest {
    title?: string;
    content?: string;
}
/** Request to update note/task status */
export interface UpdateNoteStatusRequest {
    status: NoteStatus;
}
/** Response containing notes list */
export interface NotesListResponse {
    data: NoteItem[];
}
/** A single comment on a task or workflow step */
export interface CommentItem {
    id: string;
    content: string;
    userId: string;
    userName: string;
    userRole: string;
    createdAt: string;
    updatedAt: string;
}
/** Paginated comment list response */
export interface CommentListResponse {
    comments: CommentItem[];
    total: number;
    page: number;
    limit: number;
}
/** Chat error data sent via WebSocket chat:error event */
export interface ChatErrorData {
    type: string;
    message: string;
}
/** A single step in a concept workflow (generated by LLM, cached in DB) */
export interface WorkflowStep {
    stepNumber: number;
    title: string;
    description: string;
    promptTemplate: string;
    expectedOutcome: string;
    estimatedMinutes: number;
    departmentTag?: string;
}
/** A step in an execution plan (derived from WorkflowStep + concept metadata) */
export interface ExecutionPlanStep {
    stepId: string;
    conceptId: string;
    conceptName: string;
    workflowStepNumber: number;
    title: string;
    description: string;
    estimatedMinutes: number;
    departmentTag?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    /** The originating task's title — injected as user-specific context during execution */
    taskTitle?: string;
    /** The originating task's content/description */
    taskContent?: string;
    /** The conversation where the task was created — used to load chat context */
    taskConversationId?: string;
}
/** Full execution plan for a set of selected tasks */
export interface ExecutionPlan {
    planId: string;
    taskIds: string[];
    steps: ExecutionPlanStep[];
    totalEstimatedMinutes: number;
    conceptOrder: string[];
    status: 'awaiting_approval' | 'executing' | 'completed' | 'cancelled' | 'failed';
    createdAt: string;
}
/** WebSocket payload: plan ready for user approval */
export interface WorkflowPlanReadyPayload {
    plan: ExecutionPlan;
    conversationId: string;
}
/** WebSocket payload: step execution progress */
export interface WorkflowStepProgressPayload {
    planId: string;
    stepId: string;
    stepTitle?: string;
    stepIndex?: number;
    totalSteps?: number;
    status: 'in_progress' | 'completed' | 'failed';
    content?: string;
    citations?: ConceptCitation[];
    conversationId: string;
}
/** WebSocket payload: workflow execution complete */
export interface WorkflowCompletePayload {
    planId: string;
    status: 'completed' | 'cancelled' | 'failed';
    completedSteps: number;
    totalSteps: number;
    conversationId: string;
}
/** WebSocket payload: per-concept conversations created for workflow execution */
export interface WorkflowConversationsCreatedPayload {
    planId: string;
    conversations: Array<{
        conceptId: string;
        conceptName: string;
        conversationId: string;
    }>;
    originalConversationId: string;
}
/** WebSocket payload: workflow error */
export interface WorkflowErrorPayload {
    planId?: string;
    message: string;
    conversationId: string;
}
/** WebSocket payload: step awaiting user confirmation before continuing */
export interface WorkflowStepConfirmationPayload {
    planId: string;
    completedStepId: string;
    nextStep: {
        stepId: string;
        title: string;
        description: string;
        conceptName: string;
        stepIndex: number;
        totalSteps: number;
    };
    conversationId: string;
}
/** Discriminator for workflow step interaction type */
export type WorkflowStepInputType = 'text' | 'confirmation';
/** WebSocket payload: step awaiting user input (text or confirmation) */
export interface WorkflowStepAwaitingInputPayload {
    planId: string;
    stepId: string;
    stepTitle: string;
    stepDescription: string;
    conceptName: string;
    stepIndex: number;
    totalSteps: number;
    inputType: WorkflowStepInputType;
    conversationId: string;
}
/** WebSocket payload: complete workflow step message for chat rendering */
export interface WorkflowStepMessagePayload {
    planId: string;
    conversationId: string;
    messageId: string;
    content: string;
    stepIndex: number;
    totalSteps: number;
    inputType: WorkflowStepInputType;
    conceptName: string;
}
/** WebSocket payload: navigate to a specific conversation for workflow execution */
export interface WorkflowNavigatePayload {
    planId: string;
    conversationId: string;
    conceptName: string;
}
export type ExecutionMode = 'MANUAL' | 'YOLO';
export interface YoloConfig {
    maxConcurrency: number;
    maxConceptsHardStop: number;
    retryAttempts: number;
    retryBaseDelayMs?: number;
    circuitBreakerCooldownMs?: number;
    /** Max concepts to fully execute workflows for (default 50). Remainder created as PENDING only. */
    maxExecutionBudget?: number;
}
export interface YoloProgressPayload {
    planId: string;
    running: number;
    maxConcurrency: number;
    completed: number;
    failed: number;
    total: number;
    discoveredCount: number;
    /** Max concepts that will be fully executed (Story 3.10) */
    executionBudget?: number;
    /** Concepts fully executed so far (completed + running) */
    executedSoFar?: number;
    /** Concepts created as PENDING tasks but not executed this run */
    createdOnlyCount?: number;
    /** Total candidates considered before top-N selection */
    totalConsidered?: number;
    currentTasks: Array<{
        conceptName: string;
        status: string;
        /** Current workflow step title (e.g., "Market Analysis") */
        currentStep?: string;
        /** Zero-based index of current step within the workflow */
        currentStepIndex?: number;
        /** Total number of steps in this task's workflow */
        totalSteps?: number;
    }>;
    /** Last N log entries from the YOLO activity log */
    recentLogs?: string[];
    conversationId: string;
}
/** Enriched search result with optional full page content */
export interface EnrichedSearchResult {
    title: string;
    link: string;
    snippet: string;
    /** Extracted page content (truncated), if deep fetch succeeded */
    pageContent?: string;
    /** Timestamp when the result was fetched */
    fetchedAt: string;
}
export interface YoloCompletePayload {
    planId: string;
    status: 'completed' | 'failed' | 'hard-stopped';
    completed: number;
    failed: number;
    total: number;
    discoveredCount: number;
    durationMs: number;
    conversationId: string;
    /** Final log entries from the YOLO execution */
    logs?: string[];
    /** Concepts created as PENDING tasks but not executed this run */
    createdOnlyCount?: number;
    /** Total candidates considered before top-N selection */
    totalConsidered?: number;
    /** Execution budget that was applied */
    executionBudget?: number;
}
