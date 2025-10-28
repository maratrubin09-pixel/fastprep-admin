import { Controller, Get, Post, Put, Delete, Body, Param, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getAllUsers(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    try {
      const users = await this.usersService.getAllUsers();
      return { users };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to fetch users' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post()
  async createUser(
    @Headers('authorization') authHeader: string,
    @Body() body: { name: string; email: string; password: string; role?: string }
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    try {
      const user = await this.usersService.createUser(body);
      return { user };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to create user' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Put(':id')
  async updateUser(
    @Headers('authorization') authHeader: string,
    @Param('id') userId: string,
    @Body() body: { name?: string; email?: string; password?: string; role?: string }
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    try {
      const user = await this.usersService.updateUser(userId, body);
      return { user };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to update user' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Delete(':id')
  async deleteUser(
    @Headers('authorization') authHeader: string,
    @Param('id') userId: string
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    try {
      await this.usersService.deleteUser(userId);
      return { success: true, message: 'User deleted successfully' };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to delete user' },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}


