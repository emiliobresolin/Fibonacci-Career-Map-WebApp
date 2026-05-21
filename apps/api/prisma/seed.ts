// Prisma seed — runs automatically on `prisma migrate dev` and `prisma migrate
// reset`. Does NOT run on `prisma migrate deploy` (production), so this is
// structurally development-only (AC3 of Story 2-1).
//
// Idempotent and authoritative: re-running converges the dev state to whatever
// this file says, even after editing the values. The seed exercises the
// dual-role carve-out from PRD §4.2 by giving the admin user both ADMIN and
// EMPLOYEE role_assignment rows — so the composite-unique constraint is
// stressed by the seed itself.

import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // ─── Dev organization ──────────────────────────────────────────────────────
  // `update` populated with the same fields as `create` so re-seed converges
  // on the current source-file values (review F4 — `update: {}` was a no-op
  // upsert that silently ignored edits).
  const org = await prisma.organization.upsert({
    where: { slug: 'fcm-dev' },
    update: {
      name: 'FCM Dev Organization',
    },
    create: {
      slug: 'fcm-dev',
      name: 'FCM Dev Organization',
      // oidcConfig intentionally null — bootstrap admin fallback (Story E2.7)
      // covers auth until OIDC is wired in the dev cluster.
    },
  });

  // ─── Dev ADMIN user (also holds EMPLOYEE — dual-role carve-out) ────────────
  const admin = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'admin@fcm.dev',
      },
    },
    update: {
      displayName: 'Dev Admin',
    },
    create: {
      email: 'admin@fcm.dev',
      displayName: 'Dev Admin',
      organizationId: org.id,
    },
  });

  await prisma.roleAssignment.upsert({
    where: {
      userId_organizationId_role: {
        userId: admin.id,
        organizationId: org.id,
        role: Role.ADMIN,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      organizationId: org.id,
      role: Role.ADMIN,
    },
  });

  // Dual-role carve-out (PRD §4.2 + arch §10.2): an admin who is ALSO an
  // employee has two role_assignment rows. Exercising this in the seed both
  // demonstrates the pattern and acts as a free smoke test that the composite
  // unique allows it.
  await prisma.roleAssignment.upsert({
    where: {
      userId_organizationId_role: {
        userId: admin.id,
        organizationId: org.id,
        role: Role.EMPLOYEE,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      organizationId: org.id,
      role: Role.EMPLOYEE,
    },
  });

  // ─── Dev EMPLOYEE-only user ────────────────────────────────────────────────
  const employee = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'employee@fcm.dev',
      },
    },
    update: {
      displayName: 'Dev Employee',
    },
    create: {
      email: 'employee@fcm.dev',
      displayName: 'Dev Employee',
      organizationId: org.id,
    },
  });

  await prisma.roleAssignment.upsert({
    where: {
      userId_organizationId_role: {
        userId: employee.id,
        organizationId: org.id,
        role: Role.EMPLOYEE,
      },
    },
    update: {},
    create: {
      userId: employee.id,
      organizationId: org.id,
      role: Role.EMPLOYEE,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seeded org ${org.slug}: ${admin.email} (ADMIN + EMPLOYEE dual-role), ${employee.email} (EMPLOYEE)`,
  );
}

// Top-level orchestration: catch errors from main, ensure clean disconnect,
// then exit with a correct code. Review F7: previous `void prisma.$disconnect()`
// in .finally swallowed disconnect failures and raced with process.exit(1) on
// main() rejections.
let exitCode = 0;
try {
  await main();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err);
  exitCode = 1;
} finally {
  try {
    await prisma.$disconnect();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`Prisma disconnect failed: ${String(err)}`);
  }
  process.exit(exitCode);
}
