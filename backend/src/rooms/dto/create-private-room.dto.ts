import { IsMongoId } from 'class-validator';

export class CreatePrivateRoomDto {
  @IsMongoId()
  userId: string;
}