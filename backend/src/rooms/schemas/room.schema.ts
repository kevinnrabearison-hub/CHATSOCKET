import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoomDocument = HydratedDocument<Room>;

@Schema({ timestamps: true })
export class Room {
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    required: true,
  })
  members: Types.ObjectId[];

  @Prop({ type: String, default: null })
  name?: string;

  @Prop({ type: Boolean, default: false })
  isGroup?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

// Index pour recherche rapide par membres
RoomSchema.index({ members: 1 });