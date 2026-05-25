/**
 * src/modules/users/users.controller.ts
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { UpdateProfileDto, UserProfileDto } from './dto/user.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthenticatedUser } from '../../common/interfaces'

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.usersService.findById(user.id)
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto
  ): Promise<UserProfileDto> {
    return this.usersService.updateProfile(user.id, dto)
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by username or display name' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({ name: 'limit', description: 'Max results', required: false })
  @ApiResponse({ status: 200, type: [UserProfileDto] })
  search(@Query('q') query: string, @Query('limit') limit?: number): Promise<UserProfileDto[]> {
    return this.usersService.search(query, limit)
  }

  @Get('by-username/:username')
  @ApiOperation({ summary: 'Get user by username' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  findByUsername(@Param('username') username: string): Promise<UserProfileDto> {
    return this.usersService.findByUsername(username)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<UserProfileDto> {
    return this.usersService.findById(id)
  }
}
