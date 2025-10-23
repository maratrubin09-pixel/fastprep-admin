import { Controller, Get, Post, Delete, Param, Headers, Body, HttpException, HttpStatus } from '@nestjs/common';
import { MessengersService } from './messengers.service';

@Controller('messengers')
export class MessengersController {
  constructor(private readonly messengersService: MessengersService) {}

  @Get('status')
  async getStatus(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    try {
      const status = await this.messengersService.getStatus(token);
      return { success: true, messengers: status };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to get status' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post(':platform/connect')
  async connect(
    @Headers('authorization') authHeader: string,
    @Param('platform') platform: string,
    @Body() body: any
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    try {
      const result = await this.messengersService.connect(token, platform, body);
      return { success: true, ...result };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to connect' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get(':platform/qr')
  async getQrCode(
    @Headers('authorization') authHeader: string,
    @Param('platform') platform: string
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    try {
      const qrCode = await this.messengersService.getQrCode(token, platform);
      return { success: true, qrCode };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to get QR code' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post(':platform/verify')
  async verify(
    @Headers('authorization') authHeader: string,
    @Param('platform') platform: string
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    try {
      const result = await this.messengersService.verify(token, platform);
      return { success: true, ...result };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to verify' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Delete(':platform/disconnect')
  async disconnect(
    @Headers('authorization') authHeader: string,
    @Param('platform') platform: string
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    try {
      await this.messengersService.disconnect(token, platform);
      return { success: true, message: 'Disconnected successfully' };
    } catch (err: any) {
      throw new HttpException(
        { message: err.message || 'Failed to disconnect' },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}

