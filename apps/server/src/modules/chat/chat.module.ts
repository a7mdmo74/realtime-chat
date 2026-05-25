/**
 * src/modules/chat/chat.module.ts
 */

import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ChatGateway } from './gateways/chat.gateway'
import { WsJwtGuard } from './gateways/ws-jwt.guard'
import { MessagesModule } from '../messages/messages.module'
import { UsersModule } from '../users/users.module'

@Module({
  imports: [
    MessagesModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, WsJwtGuard],
  exports: [ChatService],
})
export class ChatModule {}
