import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { TenantPrismaService } from '@mentor-ai/shared/tenant-context';
import { Prisma } from '@prisma/client';
import type {
  Conversation,
  ConversationWithMessages,
  ConceptTreeData,
  ConceptHierarchyNode,
  CurriculumNode,
  Message,
  MessageRole,
  PersonaType,
  ConfidenceFactor,
} from '@mentor-ai/shared/types';
import { ConceptService } from '../knowledge/services/concept.service';
import { CurriculumService } from '../knowledge/services/curriculum.service';
import { CitationService } from '../knowledge/services/citation.service';
import { NotesService } from '../notes/notes.service';
import { getVisibleCategories, ALL_CATEGORIES } from '../knowledge/config/department-categories';

/**
 * Service for managing chat conversations.
 * All operations are tenant-scoped through the TenantPrismaService.
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly conceptService: ConceptService,
    private readonly curriculumService: CurriculumService,
    private readonly citationService: CitationService,
    private readonly notesService: NotesService
  ) {}

  /**
   * Creates a new conversation for a user.
   * @param tenantId - Tenant ID for database isolation
   * @param userId - User ID who owns the conversation
   * @param title - Optional conversation title
   * @param personaType - Optional persona type for department-specific responses
   * @param conceptId - Optional concept ID to link conversation to a business concept
   * @returns Created conversation
   */
  async createConversation(
    tenantId: string,
    userId: string,
    title?: string,
    personaType?: PersonaType,
    conceptId?: string
  ): Promise<Conversation> {
    const prisma = await this.tenantPrisma.getClient(tenantId);
    const conversationId = `sess_${createId()}`;

    const conversation = await prisma.conversation.create({
      data: {
        id: conversationId,
        userId,
        title: title ?? null,
        personaType: personaType ?? null,
        conceptId: conceptId ?? null,
      },
    });

    // Look up concept details for response
    let conceptName: string | null = null;
    let conceptCategory: string | null = null;
    if (conceptId) {
      const conceptMap = await this.conceptService.findByIds([conceptId]);
      const info = conceptMap.get(conceptId);
      if (info) {
        conceptName = info.name;
        conceptCategory = info.category;
      }
    }

    this.logger.log({
      message: 'Conversation created',
      conversationId,
      userId,
      tenantId,
      personaType: personaType ?? 'none',
      conceptId: conceptId ?? 'none',
    });

    return this.mapConversation(conversation, conceptName, conceptCategory);
  }

  /**
   * Updates the persona for a conversation.
   * @param tenantId - Tenant ID for database isolation
   * @param conversationId - Conversation ID to update
   * @param userId - User ID for ownership verification
   * @param personaType - New persona type
   * @returns Updated conversation
   * @throws NotFoundException if conversation not found
   * @throws ForbiddenException if user doesn't own the conversation
   */
  async updatePersona(
    tenantId: string,
    conversationId: string,
    userId: string,
    personaType: PersonaType
  ): Promise<Conversation> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException({
        type: 'conversation_not_found',
        title: 'Conversation Not Found',
        status: 404,
        detail: `Conversation with ID ${conversationId} not found`,
      });
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException({
        type: 'conversation_access_denied',
        title: 'Access Denied',
        status: 403,
        detail: 'You do not have access to this conversation',
      });
    }

    const previousPersona = conversation.personaType;
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { personaType },
    });

    this.logger.log({
      message: 'Conversation persona updated',
      conversationId,
      userId,
      tenantId,
      previousPersona: previousPersona ?? 'none',
      newPersona: personaType,
    });

    return this.mapConversation(updated);
  }

  /**
   * Lists all conversations for a user.
   * @param tenantId - Tenant ID for database isolation
   * @param userId - User ID to filter conversations
   * @returns Array of conversations (without messages)
   */
  async listConversations(tenantId: string, userId: string): Promise<Conversation[]> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    return conversations.map((c) => this.mapConversation(c));
  }

  /**
   * Lists conversations grouped by curriculum hierarchy for tree display.
   * Builds a sparse tree showing only branches that have active conversations.
   */
  async listGroupedConversations(tenantId: string, userId: string): Promise<ConceptTreeData> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    // Separate linked vs unlinked
    const linked = conversations.filter((c) => c.conceptId);
    const uncategorized = conversations.filter((c) => !c.conceptId);

    // Get active concepts with their curriculumId
    const activeConceptMap = await this.curriculumService.getActiveConceptsByCurriculum();

    // Map concept IDs to curriculum IDs, group conversations by curriculumId
    const convsByCurriculumId = new Map<string, Conversation[]>();
    const orphaned: typeof uncategorized = [];

    for (const conv of linked) {
      // Find which curriculum node this concept maps to
      let foundCurriculumId: string | null = null;
      for (const [currId, conceptInfo] of activeConceptMap.entries()) {
        if (conceptInfo.id === conv.conceptId) {
          foundCurriculumId = currId;
          break;
        }
      }
      if (!foundCurriculumId) {
        orphaned.push(conv);
        continue;
      }
      const mapped = this.mapConversation(conv);
      if (!convsByCurriculumId.has(foundCurriculumId)) {
        convsByCurriculumId.set(foundCurriculumId, []);
      }
      convsByCurriculumId.get(foundCurriculumId)!.push(mapped);
    }

    // Collect ALL discovered concept IDs from notes and citations
    const allDiscoveredConceptIds = new Set<string>();
    try {
      const noteConceptIds = await this.notesService.getDiscoveredConceptIds(userId, tenantId);
      noteConceptIds.forEach((id) => allDiscoveredConceptIds.add(id));
    } catch {
      // Non-critical
    }
    try {
      const citationConceptIds = await this.citationService.getDiscoveredConceptIds(userId);
      citationConceptIds.forEach((id) => allDiscoveredConceptIds.add(id));
    } catch {
      // Non-critical
    }

    // Add discovered concepts to curriculum tree if they have curriculumId
    for (const conceptId of allDiscoveredConceptIds) {
      for (const [currId, conceptInfo] of activeConceptMap.entries()) {
        if (conceptInfo.id === conceptId && !convsByCurriculumId.has(currId)) {
          convsByCurriculumId.set(currId, []); // discovered via tasks/citations, no conversations yet
        }
      }
    }

    // Build sparse hierarchy tree from curriculum data
    const activeCurriculumIds = new Set(convsByCurriculumId.keys());
    const neededIds = new Set<string>();
    for (const currId of activeCurriculumIds) {
      const chain = this.curriculumService.getAncestorChain(currId);
      for (const node of chain) {
        neededIds.add(node.id);
      }
    }

    const fullTree = this.curriculumService.getFullTree();
    const neededNodes = fullTree.filter((n) => neededIds.has(n.id));
    const tree = this.buildHierarchyTree(neededNodes, convsByCurriculumId, activeConceptMap);

    // === Category-based fallback for concepts WITHOUT curriculumId ===
    // Seeded concepts (from Qdrant) may not have curriculumId set.
    // Group them by category (Finance, Marketing, etc.) as fallback tree nodes.
    const curriculumMappedConceptIds = new Set<string>();
    for (const [, info] of activeConceptMap.entries()) {
      curriculumMappedConceptIds.add(info.id);
    }

    // Collect concept IDs that are NOT in curriculum
    const unmappedConceptIds = new Set<string>();
    for (const conv of orphaned) {
      if (conv.conceptId) unmappedConceptIds.add(conv.conceptId);
    }
    for (const id of allDiscoveredConceptIds) {
      if (!curriculumMappedConceptIds.has(id)) unmappedConceptIds.add(id);
    }

    if (unmappedConceptIds.size > 0) {
      const conceptDetails = await this.conceptService.findByIds([...unmappedConceptIds]);

      // Group orphaned conversations by their conceptId
      const orphanedConvsByConceptId = new Map<string, Conversation[]>();
      for (const conv of orphaned) {
        if (conv.conceptId && unmappedConceptIds.has(conv.conceptId)) {
          if (!orphanedConvsByConceptId.has(conv.conceptId)) {
            orphanedConvsByConceptId.set(conv.conceptId, []);
          }
          orphanedConvsByConceptId.get(conv.conceptId)!.push(this.mapConversation(conv));
        }
      }

      // Build category → concepts grouping
      const byCategory = new Map<
        string,
        { conceptId: string; name: string; convs: Conversation[] }[]
      >();
      for (const [conceptId, info] of conceptDetails) {
        const cat = info.category || 'General';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        const convs = orphanedConvsByConceptId.get(conceptId) ?? [];
        byCategory.get(cat)!.push({ conceptId, name: info.name, convs });
      }

      // Create category tree nodes
      for (const [category, concepts] of byCategory) {
        const children: ConceptHierarchyNode[] = concepts.map((c) => ({
          curriculumId: `concept-${c.conceptId}`,
          label: c.name,
          conceptId: c.conceptId,
          children: [],
          conversationCount: c.convs.length,
          conversations: c.convs,
        }));

        const totalConvs = children.reduce((sum, ch) => sum + ch.conversationCount, 0);
        tree.push({
          curriculumId: `category-${category.toLowerCase().replace(/\s+/g, '-')}`,
          label: category,
          children,
          conversationCount: totalConvs,
          conversations: [],
        });
      }

      // Remove orphaned conversations that are now placed in category tree
      const placedOrphanIds = new Set(
        orphaned.filter((c) => c.conceptId && unmappedConceptIds.has(c.conceptId)).map((c) => c.id)
      );
      const remainingOrphaned = orphaned.filter((c) => !placedOrphanIds.has(c.id));

      return {
        tree,
        uncategorized: [...uncategorized, ...remainingOrphaned].map((c) => this.mapConversation(c)),
      };
    }

    return {
      tree,
      uncategorized: [...uncategorized, ...orphaned].map((c) => this.mapConversation(c)),
    };
  }

  /**
   * Builds a hierarchical tree from the needed curriculum nodes.
   */
  private buildHierarchyTree(
    nodes: CurriculumNode[],
    convsByCurriculumId: Map<string, Conversation[]>,
    activeConceptMap: Map<
      string,
      { id: string; name: string; curriculumId: string; parentId: string | null }
    >
  ): ConceptHierarchyNode[] {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const childrenMap = new Map<string | null, CurriculumNode[]>();

    for (const node of nodes) {
      const parentKey = node.parentId;
      if (!childrenMap.has(parentKey)) {
        childrenMap.set(parentKey, []);
      }
      childrenMap.get(parentKey)!.push(node);
    }

    const buildNode = (currNode: CurriculumNode): ConceptHierarchyNode => {
      const children = (childrenMap.get(currNode.id) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(buildNode);

      const directConvs = convsByCurriculumId.get(currNode.id) ?? [];
      const childConvCount = children.reduce((sum, c) => sum + c.conversationCount, 0);
      const conceptInfo = activeConceptMap.get(currNode.id);

      return {
        curriculumId: currNode.id,
        label: currNode.label,
        conceptId: conceptInfo?.id,
        children,
        conversationCount: directConvs.length + childConvCount,
        conversations: directConvs,
      };
    };

    // Get root nodes (those whose parentId is not in our needed set)
    const roots = nodes.filter((n) => !n.parentId || !nodeMap.has(n.parentId));
    return roots.sort((a, b) => a.sortOrder - b.sortOrder).map(buildNode);
  }

  /**
   * Builds the Business Brain tree (Story 3.2).
   * Shows only concepts with conversations (completed) or pending tasks.
   * Filtered by user's department → visible categories.
   */
  async getBrainTree(
    tenantId: string,
    userId: string,
    department: string | null,
    role: string
  ): Promise<{
    categories: Array<{
      name: string;
      concepts: Array<{
        id: string;
        name: string;
        slug: string;
        status: 'completed' | 'pending';
        completedByUserId?: string;
        conversationId?: string;
        pendingNoteId?: string;
      }>;
    }>;
  }> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    // 1. Get all conversations with concepts (all users in tenant)
    const convRows = await prisma.conversation.findMany({
      where: { conceptId: { not: null } },
      select: { conceptId: true, userId: true, id: true },
      orderBy: { updatedAt: 'desc' },
    });

    // 2. Get pending task notes
    const isOwner = role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER' || !department;
    const pendingTasks = await this.notesService.getPendingTaskConceptIds(
      tenantId,
      isOwner ? undefined : userId
    );

    // 3. Collect unique concept IDs and build lookup maps
    const allConceptIds = new Set<string>();
    const completedMap = new Map<string, { userId: string; conversationId: string }>();
    const pendingMap = new Map<string, { userId: string; noteId: string }>();

    for (const conv of convRows) {
      if (conv.conceptId) {
        allConceptIds.add(conv.conceptId);
        if (!completedMap.has(conv.conceptId)) {
          completedMap.set(conv.conceptId, {
            userId: conv.userId,
            conversationId: conv.id,
          });
        }
      }
    }

    for (const task of pendingTasks) {
      allConceptIds.add(task.conceptId);
      if (!pendingMap.has(task.conceptId)) {
        pendingMap.set(task.conceptId, {
          userId: task.userId,
          noteId: task.noteId,
        });
      }
    }

    if (allConceptIds.size === 0) {
      return { categories: [] };
    }

    // 4. Load concept details
    const conceptMap = await this.conceptService.findByIds([...allConceptIds]);

    // 5. Get visible categories for this user
    const visibleCategories = getVisibleCategories(department, role);

    // 6. Group by category
    const categoryGroups = new Map<
      string,
      Array<{
        id: string;
        name: string;
        slug: string;
        status: 'completed' | 'pending';
        completedByUserId?: string;
        conversationId?: string;
        pendingNoteId?: string;
      }>
    >();

    for (const [conceptId, info] of conceptMap) {
      // Filter by visible categories (null = no filter, owner sees all)
      if (visibleCategories && !visibleCategories.includes(info.category)) {
        continue;
      }

      const completed = completedMap.get(conceptId);
      const pending = pendingMap.get(conceptId);
      const status = completed ? 'completed' : 'pending';

      const concept: {
        id: string;
        name: string;
        slug: string;
        status: 'completed' | 'pending';
        completedByUserId?: string;
        conversationId?: string;
        pendingNoteId?: string;
      } = {
        id: conceptId,
        name: info.name,
        slug: info.slug,
        status,
      };

      if (completed) {
        concept.completedByUserId = completed.userId;
        concept.conversationId = completed.conversationId;
      }
      if (pending) {
        concept.pendingNoteId = pending.noteId;
      }

      if (!categoryGroups.has(info.category)) {
        categoryGroups.set(info.category, []);
      }
      categoryGroups.get(info.category)!.push(concept);
    }

    // 7. Build sorted category list (ordered by ALL_CATEGORIES index)
    const categories = [...categoryGroups.entries()]
      .map(([name, concepts]) => ({ name, concepts }))
      .sort((a, b) => {
        const orderA = (ALL_CATEGORIES as readonly string[]).indexOf(a.name);
        const orderB = (ALL_CATEGORIES as readonly string[]).indexOf(b.name);
        return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
      });

    return { categories };
  }

  /**
   * Updates the concept ID for a conversation.
   */
  async updateConceptId(
    tenantId: string,
    conversationId: string,
    userId: string,
    conceptId: string
  ): Promise<void> {
    const prisma = await this.tenantPrisma.getClient(tenantId);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { conceptId },
    });

    this.logger.log({
      message: 'Conversation concept updated',
      conversationId,
      userId,
      tenantId,
      conceptId,
    });
  }

  /**
   * Gets a conversation by ID with all messages.
   * @param tenantId - Tenant ID for database isolation
   * @param conversationId - Conversation ID to retrieve
   * @param userId - User ID for ownership verification
   * @returns Conversation with messages
   * @throws NotFoundException if conversation not found
   * @throws ForbiddenException if user doesn't own the conversation
   */
  async getConversation(
    tenantId: string,
    conversationId: string,
    userId: string
  ): Promise<ConversationWithMessages> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException({
        type: 'conversation_not_found',
        title: 'Conversation Not Found',
        status: 404,
        detail: `Conversation with ID ${conversationId} not found`,
      });
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException({
        type: 'conversation_access_denied',
        title: 'Access Denied',
        status: 403,
        detail: 'You do not have access to this conversation',
      });
    }

    return this.mapConversationWithMessages(conversation);
  }

  /**
   * Deletes a conversation and all its messages.
   * @param tenantId - Tenant ID for database isolation
   * @param conversationId - Conversation ID to delete
   * @param userId - User ID for ownership verification
   * @throws NotFoundException if conversation not found
   * @throws ForbiddenException if user doesn't own the conversation
   */
  async deleteConversation(
    tenantId: string,
    conversationId: string,
    userId: string
  ): Promise<void> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException({
        type: 'conversation_not_found',
        title: 'Conversation Not Found',
        status: 404,
        detail: `Conversation with ID ${conversationId} not found`,
      });
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException({
        type: 'conversation_access_denied',
        title: 'Access Denied',
        status: 403,
        detail: 'You do not have access to this conversation',
      });
    }

    // Messages are cascade deleted due to onDelete: Cascade in schema
    await prisma.conversation.delete({
      where: { id: conversationId },
    });

    this.logger.log({
      message: 'Conversation deleted',
      conversationId,
      userId,
      tenantId,
    });
  }

  /**
   * Adds a message to a conversation.
   * @param tenantId - Tenant ID for database isolation
   * @param conversationId - Conversation to add message to
   * @param role - Message role (USER or ASSISTANT)
   * @param content - Message content
   * @param confidenceScore - Optional confidence score (0.0-1.0) for AI messages
   * @param confidenceFactors - Optional confidence factor breakdown for AI messages
   * @returns Created message
   */
  async addMessage(
    tenantId: string,
    conversationId: string,
    role: MessageRole,
    content: string,
    confidenceScore?: number | null,
    confidenceFactors?: ConfidenceFactor[] | null
  ): Promise<Message> {
    const prisma = await this.tenantPrisma.getClient(tenantId);
    const messageId = `msg_${createId()}`;

    const message = await prisma.message.create({
      data: {
        id: messageId,
        conversationId,
        role,
        content,
        confidenceScore: confidenceScore ?? null,
        // Prisma requires JSON input to be cast as InputJsonValue
        confidenceFactors: confidenceFactors
          ? (confidenceFactors as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    // Update conversation's updatedAt timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    this.logger.log({
      message: 'Message added to conversation',
      messageId,
      conversationId,
      role,
      tenantId,
      confidenceScore: confidenceScore ?? 'N/A',
    });

    return this.mapMessage(message);
  }

  /**
   * Updates the conversation title.
   * @param tenantId - Tenant ID for database isolation
   * @param conversationId - Conversation to update
   * @param userId - User ID for ownership verification
   * @param title - New title
   * @returns Updated conversation
   */
  async updateTitle(
    tenantId: string,
    conversationId: string,
    userId: string,
    title: string
  ): Promise<Conversation> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException({
        type: 'conversation_not_found',
        title: 'Conversation Not Found',
        status: 404,
        detail: `Conversation with ID ${conversationId} not found`,
      });
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException({
        type: 'conversation_access_denied',
        title: 'Access Denied',
        status: 403,
        detail: 'You do not have access to this conversation',
      });
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });

    return this.mapConversation(updated);
  }

  private mapConversation(
    conversation: {
      id: string;
      userId: string;
      title: string | null;
      personaType?: string | null;
      conceptId?: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    conceptName?: string | null,
    conceptCategory?: string | null
  ): Conversation {
    return {
      id: conversation.id,
      userId: conversation.userId,
      title: conversation.title,
      personaType: (conversation.personaType as PersonaType) ?? null,
      conceptId: conversation.conceptId ?? null,
      conceptName: conceptName ?? null,
      conceptCategory: conceptCategory ?? null,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  private mapMessage(message: {
    id: string;
    conversationId: string;
    role: string;
    content: string;
    confidenceScore?: number | null;
    confidenceFactors?: unknown;
    createdAt: Date;
  }): Message {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role as MessageRole,
      content: message.content,
      confidenceScore: message.confidenceScore ?? null,
      confidenceFactors: (message.confidenceFactors as ConfidenceFactor[]) ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private mapConversationWithMessages(conversation: {
    id: string;
    userId: string;
    title: string | null;
    personaType?: string | null;
    conceptId?: string | null;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{
      id: string;
      conversationId: string;
      role: string;
      content: string;
      confidenceScore?: number | null;
      confidenceFactors?: unknown;
      createdAt: Date;
    }>;
  }): ConversationWithMessages {
    return {
      ...this.mapConversation(conversation),
      messages: conversation.messages.map((m) => this.mapMessage(m)),
    };
  }
}
