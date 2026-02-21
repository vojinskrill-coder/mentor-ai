import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { CurrentUserPayload } from '../../auth/strategies/jwt.strategy';
import { getVisibleCategories } from '../config/department-categories';

/**
 * Story 3.2: Department Fence Guard
 *
 * Validates that the requesting user has access to the resource based on
 * their department-to-category mapping. PLATFORM_OWNER and TENANT_OWNER
 * bypass all checks (getVisibleCategories returns null).
 *
 * Checks:
 * - Query param `category`: validates it's in the user's visible categories
 * - Route param `id` (conversation): looks up conversation's conceptId → concept.category
 * - Body `taskIds`: looks up each task's conceptId → concept.category
 */
@Injectable()
export class DepartmentGuard implements CanActivate {
  private readonly logger = new Logger(DepartmentGuard.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: CurrentUserPayload | undefined = request.user;

    if (!user) return true; // Let auth guards handle missing user

    const visibleCategories = getVisibleCategories(user.department, user.role);
    if (visibleCategories === null) return true; // Owner — no filter

    const visibleSet = new Set(visibleCategories);

    // Check query param `category` (e.g., yolo:start-domain)
    const category = request.query?.category || request.body?.category;
    if (category && typeof category === 'string') {
      if (!visibleSet.has(category)) {
        this.logger.warn({
          message: 'Department guard: category access denied',
          userId: user.userId,
          department: user.department,
          requestedCategory: category,
        });
        throw new ForbiddenException({
          type: 'department_access_denied',
          title: 'Access Denied',
          status: 403,
          detail: 'You do not have access to this domain.',
        });
      }
    }

    // Check route param `id` (conversation endpoints)
    const conversationId = request.params?.id;
    if (conversationId) {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { conceptId: true },
      });
      if (conversation?.conceptId) {
        const concept = await this.prisma.concept.findUnique({
          where: { id: conversation.conceptId },
          select: { category: true },
        });
        if (concept?.category && !visibleSet.has(concept.category)) {
          this.logger.warn({
            message: 'Department guard: conversation access denied',
            userId: user.userId,
            conversationId,
            conceptCategory: concept.category,
          });
          throw new ForbiddenException({
            type: 'department_access_denied',
            title: 'Access Denied',
            status: 403,
            detail: 'You do not have access to this conversation.',
          });
        }
      }
    }

    // Check body `taskIds` (workflow:run-agents)
    const taskIds = request.body?.taskIds;
    if (Array.isArray(taskIds) && taskIds.length > 0) {
      const tasks = await this.prisma.note.findMany({
        where: { id: { in: taskIds }, tenantId: user.tenantId },
        select: { conceptId: true },
      });
      const conceptIds = tasks.map((t) => t.conceptId).filter((id): id is string => id !== null);
      if (conceptIds.length > 0) {
        const concepts = await this.prisma.concept.findMany({
          where: { id: { in: conceptIds } },
          select: { category: true },
        });
        const denied = concepts.find((c) => c.category && !visibleSet.has(c.category));
        if (denied) {
          this.logger.warn({
            message: 'Department guard: task access denied',
            userId: user.userId,
            deniedCategory: denied.category,
          });
          throw new ForbiddenException({
            type: 'department_access_denied',
            title: 'Access Denied',
            status: 403,
            detail: 'One or more tasks are outside your department scope.',
          });
        }
      }
    }

    return true;
  }
}
