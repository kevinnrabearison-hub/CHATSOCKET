// src/room/dto/send-message.dto.ts
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class SendMessageDto {
  @IsMongoId()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}