/**
 * src/database/database.module.ts
 *
 * Global module — PrismaService is injected across the entire application
 * without each feature module needing to import it explicitly.
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
