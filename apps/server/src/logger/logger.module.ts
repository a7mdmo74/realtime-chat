/**
 * src/logger/logger.module.ts
 *
 * Global logger module — imported once in AppModule and available everywhere
 * via NestJS's DI system without re-importing.
 */

import { Global, Module } from '@nestjs/common';
import { AppLogger } from './logger.service';

@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggerModule {}
