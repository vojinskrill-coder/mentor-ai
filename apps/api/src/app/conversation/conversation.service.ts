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
import { getVisibleCategories } from '../knowledge/config/department-categories';

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
   * Builds the Business Brain tree (Story 3.2, rewritten Story 3.4).
   * Returns an N-level hierarchy matching the Obsidian vault structure.
   * Shows only concepts with conversations or pending/completed tasks (sparse tree).
   * All ancestor folders are preserved to maintain context.
   * Filtered by user's department → visible top-level categories.
   */
  async getBrainTree(
    tenantId: string,
    userId: string,
    department: string | null,
    role: string
  ): Promise<ConceptTreeData> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    // 1. Get conversations for linking (to enable "Pogledaj" navigation)
    const convRows = await prisma.conversation.findMany({
      where: { conceptId: { not: null } },
      select: { conceptId: true, userId: true, id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    // 2. Get task notes by status
    const isOwner = role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER' || !department;
    const [pendingTasks, completedTasks] = await Promise.all([
      this.notesService.getPendingTaskConceptIds(tenantId, isOwner ? undefined : userId),
      this.notesService.getCompletedTaskConceptIds(tenantId, isOwner ? undefined : userId),
    ]);

    // 3. Collect unique concept IDs and build lookup maps
    const allConceptIds = new Set<string>();
    const convMap = new Map<
      string,
      { userId: string; conversationId: string; title: string | null; updatedAt: Date }
    >();
    const convsByConceptId = new Map<string, Conversation[]>();
    const completedMap = new Map<string, { userId: string; noteId: string }>();
    const pendingMap = new Map<string, { userId: string; noteId: string }>();

    for (const conv of convRows) {
      if (conv.conceptId) {
        allConceptIds.add(conv.conceptId);
        if (!convMap.has(conv.conceptId)) {
          convMap.set(conv.conceptId, {
            userId: conv.userId,
            conversationId: conv.id,
            title: conv.title,
            updatedAt: conv.updatedAt,
          });
        }
        // Group all conversations by concept for the tree
        if (!convsByConceptId.has(conv.conceptId)) {
          convsByConceptId.set(conv.conceptId, []);
        }
        convsByConceptId.get(conv.conceptId)!.push({
          id: conv.id,
          title: conv.title ?? 'Untitled',
          updatedAt: conv.updatedAt.toISOString(),
        } as Conversation);
      }
    }

    for (const task of completedTasks) {
      allConceptIds.add(task.conceptId);
      if (!completedMap.has(task.conceptId)) {
        completedMap.set(task.conceptId, { userId: task.userId, noteId: task.noteId });
      }
    }

    for (const task of pendingTasks) {
      allConceptIds.add(task.conceptId);
      if (!pendingMap.has(task.conceptId)) {
        pendingMap.set(task.conceptId, { userId: task.userId, noteId: task.noteId });
      }
    }

    if (allConceptIds.size === 0) {
      return { tree: [], uncategorized: [] };
    }

    // 4. Load concept details (includes slug = curriculumId)
    const conceptMap = await this.conceptService.findByIds([...allConceptIds]);

    // 5. Get visible categories for department filtering
    const visibleCategories = getVisibleCategories(department, role);

    // 6. Collect all curriculum IDs that need to appear in the tree
    //    For each active concept, include it + all its ancestors
    const neededCurriculumIds = new Set<string>();
    const conceptToCurriculum = new Map<string, string>(); // conceptId → curriculumId

    for (const [conceptId, info] of conceptMap) {
      // Filter by visible categories (strip number prefix from DB category for comparison)
      const normalizedCategory = info.category.replace(/^\d+(\.\d+)*\.?\s+/, '');
      if (visibleCategories && !visibleCategories.includes(normalizedCategory)) {
        continue;
      }

      // Resolve curriculum ID — fall back to slug, stripping number prefix if needed
      let curriculumId = info.curriculumId ?? info.slug;
      if (!this.curriculumService.findNode(curriculumId)) {
        const stripped = curriculumId.replace(/^\d+-/, '');
        if (this.curriculumService.findNode(stripped)) {
          curriculumId = stripped;
        }
      }
      conceptToCurriculum.set(conceptId, curriculumId);

      // Add this node and all its ancestors to the needed set
      const chain = this.curriculumService.getAncestorChain(curriculumId);
      for (const ancestor of chain) {
        neededCurriculumIds.add(ancestor.id);
      }
    }

    // 7. Build sparse tree from curriculum nodes
    const allCurriculumNodes = this.curriculumService.getFullTree();
    const curriculumNodeMap = new Map(allCurriculumNodes.map((n) => [n.id, n]));

    // Build a map of curriculumId → ConceptHierarchyNode
    const treeNodeMap = new Map<string, ConceptHierarchyNode>();

    for (const currId of neededCurriculumIds) {
      const currNode = curriculumNodeMap.get(currId);
      if (!currNode) continue;

      // Find if there's an active concept at this curriculum position
      let conceptId: string | undefined;
      let status: 'completed' | 'pending' | undefined;
      let completedByUserId: string | undefined;
      let pendingNoteId: string | undefined;
      let linkedConversationId: string | undefined;
      const conversations: Conversation[] = [];

      // Search for a concept mapped to this curriculum node
      for (const [cId, cSlug] of conceptToCurriculum) {
        if (cSlug === currId) {
          conceptId = cId;
          const completed = completedMap.get(cId);
          const pending = pendingMap.get(cId);
          const conv = convMap.get(cId);
          status = completed ? 'completed' : 'pending';
          completedByUserId = completed?.userId;
          pendingNoteId = pending?.noteId;
          linkedConversationId = conv?.conversationId;
          conversations.push(...(convsByConceptId.get(cId) ?? []));
          break;
        }
      }

      treeNodeMap.set(currId, {
        curriculumId: currId,
        label: currNode.label,
        conceptId,
        children: [],
        conversationCount: 0,
        conversations,
        status,
        completedByUserId,
        pendingNoteId,
        linkedConversationId,
      });
    }

    // 8. Wire up parent-child relationships
    const rootNodes: ConceptHierarchyNode[] = [];

    for (const [currId, treeNode] of treeNodeMap) {
      const currNode = curriculumNodeMap.get(currId);
      if (!currNode?.parentId || !treeNodeMap.has(currNode.parentId)) {
        // This is a root node (or its parent isn't in the sparse tree)
        rootNodes.push(treeNode);
      } else {
        const parent = treeNodeMap.get(currNode.parentId)!;
        parent.children.push(treeNode);
      }
    }

    // 9. Sort children at every level by the curriculum sortOrder
    const sortChildren = (nodes: ConceptHierarchyNode[]): void => {
      nodes.sort((a, b) => {
        const aSort = curriculumNodeMap.get(a.curriculumId)?.sortOrder ?? 999;
        const bSort = curriculumNodeMap.get(b.curriculumId)?.sortOrder ?? 999;
        return aSort - bSort;
      });
      for (const node of nodes) {
        sortChildren(node.children);
      }
    };
    sortChildren(rootNodes);
    rootNodes.sort((a, b) => {
      const aSort = curriculumNodeMap.get(a.curriculumId)?.sortOrder ?? 999;
      const bSort = curriculumNodeMap.get(b.curriculumId)?.sortOrder ?? 999;
      return aSort - bSort;
    });

    // 10. Bubble up conversationCount from leaves to ancestors
    const bubbleUpCounts = (node: ConceptHierarchyNode): number => {
      let count = node.conversations.length;
      for (const child of node.children) {
        count += bubbleUpCounts(child);
      }
      node.conversationCount = count;
      return count;
    };
    for (const root of rootNodes) {
      bubbleUpCounts(root);
    }

    // 11. Get uncategorized conversations (no conceptId)
    const uncategorizedConvs = await prisma.conversation.findMany({
      where: { conceptId: null, userId },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const uncategorized: Conversation[] = uncategorizedConvs.map(
      (c) =>
        ({
          id: c.id,
          title: c.title ?? 'Untitled',
          updatedAt: c.updatedAt.toISOString(),
        }) as Conversation
    );

    return { tree: rootNodes, uncategorized };
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
          include: {
            attachments: {
              select: {
                id: true,
                filename: true,
                originalName: true,
                mimeType: true,
                size: true,
                createdAt: true,
              },
            },
          },
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
    attachments?: Array<{
      id: string;
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      createdAt: Date;
    }>;
  }): Message {
    const mapped: Message = {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role as MessageRole,
      content: message.content,
      confidenceScore: message.confidenceScore ?? null,
      confidenceFactors: (message.confidenceFactors as ConfidenceFactor[]) ?? null,
      createdAt: message.createdAt.toISOString(),
    };
    if (message.attachments && message.attachments.length > 0) {
      mapped.attachments = message.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        createdAt: a.createdAt.toISOString(),
      }));
    }
    return mapped;
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
      attachments?: Array<{
        id: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
        createdAt: Date;
      }>;
    }>;
  }): ConversationWithMessages {
    return {
      ...this.mapConversation(conversation),
      messages: conversation.messages.map((m) => this.mapMessage(m)),
    };
  }
}
