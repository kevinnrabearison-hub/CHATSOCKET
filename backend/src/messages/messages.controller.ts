// src/messages/messages.controller.ts
import { Controller, Post, Get, Body, Req, UseGuards, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessagesService } from './messages.service';
import { SendMessageDto } from '../messages/dto/send-message.dto';

@Controller('messages')
@UseGuards(AuthGuard('jwt'))
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async send(@Req() req, @Body() dto: SendMessageDto) {
    return this.messagesService.sendMessage(req.user.id, dto);
  }

  @Get(':roomId')
  async getRoomMessages(@Param('roomId') roomId: string) {
    return this.messagesService.findRoomMessages(roomId);
  }
}