/**
 * Shared TypeScript interfaces for Mentor AI
 * These types are used across both frontend (Angular) and backend (NestJS)
 */ /** Base entity with common fields */ "use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    CONFIDENCE_COLORS: function() {
        return CONFIDENCE_COLORS;
    },
    CircuitBreakerState: function() {
        return CircuitBreakerState;
    },
    ConceptCategory: function() {
        return ConceptCategory;
    },
    ConceptSource: function() {
        return ConceptSource;
    },
    ConfidenceLevel: function() {
        return ConfidenceLevel;
    },
    Department: function() {
        return Department;
    },
    ExportFormat: function() {
        return ExportFormat;
    },
    ExportStatus: function() {
        return ExportStatus;
    },
    INDUSTRIES: function() {
        return INDUSTRIES;
    },
    InvitationStatus: function() {
        return InvitationStatus;
    },
    LlmProviderType: function() {
        return LlmProviderType;
    },
    MEMORY_TYPE_COLORS: function() {
        return MEMORY_TYPE_COLORS;
    },
    MEMORY_TYPE_LABELS: function() {
        return MEMORY_TYPE_LABELS;
    },
    MemorySource: function() {
        return MemorySource;
    },
    MemoryType: function() {
        return MemoryType;
    },
    MessageRole: function() {
        return MessageRole;
    },
    NoteStatus: function() {
        return NoteStatus;
    },
    NoteType: function() {
        return NoteType;
    },
    PERSONA_COLORS: function() {
        return PERSONA_COLORS;
    },
    PERSONA_NAMES: function() {
        return PERSONA_NAMES;
    },
    PersonaType: function() {
        return PersonaType;
    },
    RelationshipType: function() {
        return RelationshipType;
    },
    TenantStatus: function() {
        return TenantStatus;
    }
});
var InvitationStatus;
(function(InvitationStatus) {
    InvitationStatus["PENDING"] = "PENDING";
    InvitationStatus["ACCEPTED"] = "ACCEPTED";
    InvitationStatus["EXPIRED"] = "EXPIRED";
    InvitationStatus["REVOKED"] = "REVOKED";
})(InvitationStatus || (InvitationStatus = {}));
var Department;
(function(Department) {
    Department["FINANCE"] = "FINANCE";
    Department["MARKETING"] = "MARKETING";
    Department["TECHNOLOGY"] = "TECHNOLOGY";
    Department["OPERATIONS"] = "OPERATIONS";
    Department["LEGAL"] = "LEGAL";
    Department["CREATIVE"] = "CREATIVE";
    Department["STRATEGY"] = "STRATEGY";
    Department["SALES"] = "SALES";
})(Department || (Department = {}));
const INDUSTRIES = [
    'Accounting & Finance',
    'Agriculture',
    'Automotive',
    'Construction & Real Estate',
    'Consulting',
    'Education',
    'Energy & Utilities',
    'Entertainment & Media',
    'Food & Beverage',
    'Government',
    'Healthcare',
    'Hospitality & Tourism',
    'Insurance',
    'Legal Services',
    'Manufacturing',
    'Non-Profit',
    'Professional Services',
    'Retail & E-Commerce',
    'SaaS & Technology',
    'Telecommunications',
    'Transportation & Logistics',
    'Other'
];
var ExportFormat;
(function(ExportFormat) {
    ExportFormat["PDF"] = "PDF";
    ExportFormat["MARKDOWN"] = "MARKDOWN";
    ExportFormat["JSON"] = "JSON";
})(ExportFormat || (ExportFormat = {}));
var ExportStatus;
(function(ExportStatus) {
    ExportStatus["PENDING"] = "PENDING";
    ExportStatus["PROCESSING"] = "PROCESSING";
    ExportStatus["COMPLETED"] = "COMPLETED";
    ExportStatus["FAILED"] = "FAILED";
    ExportStatus["EXPIRED"] = "EXPIRED";
})(ExportStatus || (ExportStatus = {}));
var TenantStatus;
(function(TenantStatus) {
    TenantStatus["DRAFT"] = "DRAFT";
    TenantStatus["ONBOARDING"] = "ONBOARDING";
    TenantStatus["ACTIVE"] = "ACTIVE";
    TenantStatus["SUSPENDED"] = "SUSPENDED";
    TenantStatus["PENDING_DELETION"] = "PENDING_DELETION";
    TenantStatus["DELETED"] = "DELETED";
})(TenantStatus || (TenantStatus = {}));
var LlmProviderType;
(function(LlmProviderType) {
    LlmProviderType["OPENROUTER"] = "OPENROUTER";
    LlmProviderType["LOCAL_LLAMA"] = "LOCAL_LLAMA";
    LlmProviderType["OPENAI"] = "OPENAI";
    LlmProviderType["ANTHROPIC"] = "ANTHROPIC";
    LlmProviderType["LM_STUDIO"] = "LM_STUDIO";
    LlmProviderType["DEEPSEEK"] = "DEEPSEEK";
})(LlmProviderType || (LlmProviderType = {}));
var MessageRole;
(function(MessageRole) {
    MessageRole["USER"] = "USER";
    MessageRole["ASSISTANT"] = "ASSISTANT";
})(MessageRole || (MessageRole = {}));
var CircuitBreakerState;
(function(CircuitBreakerState) {
    /** Normal operation - requests flow through */ CircuitBreakerState["CLOSED"] = "CLOSED";
    /** Circuit tripped - all requests rejected */ CircuitBreakerState["OPEN"] = "OPEN";
    /** Testing - allow one request to check if service recovered */ CircuitBreakerState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitBreakerState || (CircuitBreakerState = {}));
var PersonaType;
(function(PersonaType) {
    PersonaType["CFO"] = "CFO";
    PersonaType["CMO"] = "CMO";
    PersonaType["CTO"] = "CTO";
    PersonaType["OPERATIONS"] = "OPERATIONS";
    PersonaType["LEGAL"] = "LEGAL";
    PersonaType["CREATIVE"] = "CREATIVE";
    PersonaType["CSO"] = "CSO";
    PersonaType["SALES"] = "SALES";
})(PersonaType || (PersonaType = {}));
const PERSONA_COLORS = {
    ["CFO"]: '#10B981',
    ["CMO"]: '#F59E0B',
    ["CTO"]: '#3B82F6',
    ["OPERATIONS"]: '#8B5CF6',
    ["LEGAL"]: '#6B7280',
    ["CREATIVE"]: '#EC4899',
    ["CSO"]: '#F97316',
    ["SALES"]: '#06B6D4'
};
const PERSONA_NAMES = {
    ["CFO"]: 'CFO',
    ["CMO"]: 'CMO',
    ["CTO"]: 'CTO',
    ["OPERATIONS"]: 'COO',
    ["LEGAL"]: 'Legal',
    ["CREATIVE"]: 'Creative',
    ["CSO"]: 'CSO',
    ["SALES"]: 'Sales'
};
var ConfidenceLevel;
(function(ConfidenceLevel) {
    /** High confidence: 85-100% */ ConfidenceLevel["HIGH"] = "HIGH";
    /** Medium confidence: 50-84% */ ConfidenceLevel["MEDIUM"] = "MEDIUM";
    /** Low confidence: 0-49% */ ConfidenceLevel["LOW"] = "LOW";
})(ConfidenceLevel || (ConfidenceLevel = {}));
const CONFIDENCE_COLORS = {
    ["HIGH"]: '#22C55E',
    ["MEDIUM"]: '#EAB308',
    ["LOW"]: '#EF4444'
};
var ConceptCategory;
(function(ConceptCategory) {
    ConceptCategory["FINANCE"] = "Finance";
    ConceptCategory["MARKETING"] = "Marketing";
    ConceptCategory["TECHNOLOGY"] = "Technology";
    ConceptCategory["OPERATIONS"] = "Operations";
    ConceptCategory["LEGAL"] = "Legal";
    ConceptCategory["CREATIVE"] = "Creative";
    ConceptCategory["STRATEGY"] = "Strategy";
    ConceptCategory["SALES"] = "Sales";
})(ConceptCategory || (ConceptCategory = {}));
var RelationshipType;
(function(RelationshipType) {
    /** Must understand this concept first */ RelationshipType["PREREQUISITE"] = "PREREQUISITE";
    /** Related topic */ RelationshipType["RELATED"] = "RELATED";
    /** Deeper dive on this topic */ RelationshipType["ADVANCED"] = "ADVANCED";
})(RelationshipType || (RelationshipType = {}));
var ConceptSource;
(function(ConceptSource) {
    /** Pre-loaded from seed JSON files */ ConceptSource["SEED_DATA"] = "SEED_DATA";
    /** Created via curriculum tree UI */ ConceptSource["CURRICULUM"] = "CURRICULUM";
    /** Automatically extracted from AI output */ ConceptSource["AI_DISCOVERED"] = "AI_DISCOVERED";
})(ConceptSource || (ConceptSource = {}));
var MemoryType;
(function(MemoryType) {
    /** Context about a specific client */ MemoryType["CLIENT_CONTEXT"] = "CLIENT_CONTEXT";
    /** Context about a specific project */ MemoryType["PROJECT_CONTEXT"] = "PROJECT_CONTEXT";
    /** User preferences and working style */ MemoryType["USER_PREFERENCE"] = "USER_PREFERENCE";
    /** General factual statements */ MemoryType["FACTUAL_STATEMENT"] = "FACTUAL_STATEMENT";
})(MemoryType || (MemoryType = {}));
var MemorySource;
(function(MemorySource) {
    /** Automatically extracted from conversation by AI */ MemorySource["AI_EXTRACTED"] = "AI_EXTRACTED";
    /** Explicitly stated by user */ MemorySource["USER_STATED"] = "USER_STATED";
    /** Corrected by user after AI extraction */ MemorySource["USER_CORRECTED"] = "USER_CORRECTED";
})(MemorySource || (MemorySource = {}));
const MEMORY_TYPE_COLORS = {
    ["CLIENT_CONTEXT"]: '#3B82F6',
    ["PROJECT_CONTEXT"]: '#8B5CF6',
    ["USER_PREFERENCE"]: '#10B981',
    ["FACTUAL_STATEMENT"]: '#6B7280'
};
const MEMORY_TYPE_LABELS = {
    ["CLIENT_CONTEXT"]: 'Client',
    ["PROJECT_CONTEXT"]: 'Project',
    ["USER_PREFERENCE"]: 'Preference',
    ["FACTUAL_STATEMENT"]: 'Fact'
};
var NoteType;
(function(NoteType) {
    NoteType["TASK"] = "TASK";
    NoteType["NOTE"] = "NOTE";
    NoteType["SUMMARY"] = "SUMMARY";
    NoteType["COMMENT"] = "COMMENT";
})(NoteType || (NoteType = {}));
var NoteStatus;
(function(NoteStatus) {
    NoteStatus["PENDING"] = "PENDING";
    NoteStatus["READY_FOR_REVIEW"] = "READY_FOR_REVIEW";
    NoteStatus["COMPLETED"] = "COMPLETED";
})(NoteStatus || (NoteStatus = {}));

//# sourceMappingURL=types.js.map