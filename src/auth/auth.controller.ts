import { Controller, Post, Get, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    try {
      const result = await this.authService.login(body.email, body.password);
      return result;
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Login failed' },
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  @Get('me')
  async getMe(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    try {
      const user = await this.authService.getMe(token);
      return user;
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Invalid token' },
        HttpStatus.UNAUTHORIZED
      );
    }
  }
}

