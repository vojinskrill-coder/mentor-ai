import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Starting database seed...');

  // Create default platform settings if not exist
  const existingPlatform = await prisma.platform.findFirst();

  if (!existingPlatform) {
    const platform = await prisma.platform.create({
      data: {
        name: 'Mentor AI',
        version: '1.0.0',
        settings: {
          maxTenantsPerInstance: 100,
          defaultTenantQuota: {
            maxUsers: 50,
            maxStorageGb: 10,
            maxApiCallsPerMonth: 100000,
          },
          featureFlags: {
            voiceCommands: false,
            advancedAnalytics: false,
            customBranding: false,
          },
        },
      },
    });
    console.log(`Created platform settings: ${platform.name} v${platform.version}`);
  } else {
    console.log('Platform settings already exist, skipping.');
  }

  // Create dev tenant if not exists (for DEV_MODE)
  const devTenantId = 'dev-tenant-001';
  const existingTenant = await prisma.tenant.findUnique({ where: { id: devTenantId } });

  if (!existingTenant) {
    await prisma.tenant.create({
      data: {
        id: devTenantId,
        name: 'Dev Workspace',
        industry: 'Technology',
        description: 'Local development workspace',
        status: 'ACTIVE',
        tokenQuota: 1000000,
      },
    });
    console.log('Created dev tenant: Dev Workspace');
  } else {
    console.log('Dev tenant already exists, skipping.');
  }

  // Create dev user if not exists (for DEV_MODE)
  const devUserId = 'dev-user-001';
  const existingUser = await prisma.user.findUnique({ where: { id: devUserId } });

  if (!existingUser) {
    await prisma.user.create({
      data: {
        id: devUserId,
        email: 'dev@mentor-ai.local',
        name: 'Dev User',
        role: 'TENANT_OWNER',
        tenantId: devTenantId,
        mfaEnabled: true,
      },
    });
    console.log('Created dev user: dev@mentor-ai.local');
  } else {
    console.log('Dev user already exists, skipping.');
  }

  // Create dev tenant registry entry if not exists
  const existingRegistry = await prisma.tenantRegistry.findUnique({ where: { id: devTenantId } });

  if (!existingRegistry) {
    await prisma.tenantRegistry.create({
      data: {
        id: devTenantId,
        name: 'Dev Workspace',
        dbUrl: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/mentor_ai_dev',
        status: 'ACTIVE',
      },
    });
    console.log('Created dev tenant registry entry');
  } else {
    console.log('Dev tenant registry already exists, skipping.');
  }

  console.log('Database seed completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
