// Single exported module barrel (AC3). Every consumer of the data layer imports
// from `@/prisma` (or relative path), never directly from `@prisma/client` or from
// `./prisma.service.js` — this keeps the data layer swappable in the future
// (e.g., adding a repository pattern, splitting read/write clients).
export { PrismaModule } from './prisma.module.js';
export { PrismaService } from './prisma.service.js';
