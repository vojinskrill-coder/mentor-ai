import { Injectable, ConflictException } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { generateUserId, generateTenantId } from '@mentor-ai/shared/utils';
import { TenantStatus, UserRole } from '@mentor-ai/shared/prisma';
import { RegisterTenantDto } from './dto/register-tenant.dto';

export interface RegistrationResult {
  tenantId: string;
  userId: string;
  email: string;
  companyName: string;
  iconUrl?: string;
}

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async checkEmailExists(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return user !== null;
  }

  async registerTenant(dto: RegisterTenantDto): Promise<RegistrationResult> {
    const normalizedEmail = dto.email.toLowerCase();

    // Check for existing email
    const emailExists = await this.checkEmailExists(normalizedEmail);
    if (emailExists) {
      throw new ConflictException({
        type: 'email_already_exists',
        title: 'Email Already Registered',
        status: 409,
        detail: 'An account with this email already exists',
      });
    }

    // Generate IDs with prefixes
    const tenantId = generateTenantId();
    const userId = generateUserId();

    // Create tenant and user in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Create tenant in DRAFT state
      await tx.tenant.create({
        data: {
          id: tenantId,
          name: dto.companyName,
          industry: dto.industry,
          description: dto.description,
          status: TenantStatus.DRAFT,
        },
      });

      // Create user with TENANT_OWNER role
      await tx.user.create({
        data: {
          id: userId,
          email: normalizedEmail,
          role: UserRole.TENANT_OWNER,
          tenantId: tenantId,
        },
      });
    });

    return {
      tenantId,
      userId,
      email: normalizedEmail,
      companyName: dto.companyName,
    };
  }

  async updateTenantIcon(tenantId: string, iconUrl: string): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { iconUrl },
    });
  }
}
