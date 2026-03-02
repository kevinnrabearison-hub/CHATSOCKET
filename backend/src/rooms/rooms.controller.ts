import { Controller, Post, UseGuards, Req, Body, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RoomsService } from './rooms.service';
import { CreatePrivateRoomDto } from './dto/create-private-room.dto';

@Controller('rooms')
export class RoomsController {   // ✅ Ici, il faut bien exporter la classe
  constructor(private readonly roomsService: RoomsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('private')
  async createPrivateRoom(@Req() req, @Body() dto: CreatePrivateRoomDto) {
    const currentUserId = req.user.id;
    const otherUserId = dto.userId;

    const room = await this.roomsService.createPrivateRoom([currentUserId, otherUserId]);
    return room;
  }

  @UseGuards(AuthGuard('jwt'))
  @Get()
  async getUserRooms(@Req() req) {
    return this.roomsService.findUserRooms(req.user.id);
  }
}