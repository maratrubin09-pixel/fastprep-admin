import { Controller, Post, Get, Put, Body, Req, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public() // Этот endpoint доступен без JWT
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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: any) {
    // req.user установлен JwtStrategy
    try {
      const user = await this.authService.getMe(req.user.id);
      return user;
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'User not found' },
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @Req() req: any,
    @Body() body: { name?: string; email?: string; currentPassword?: string; newPassword?: string }
  ) {
    // req.user установлен JwtStrategy
    try {
      const user = await this.authService.updateProfile(req.user.id, body);
      return user;
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to update profile' },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}

