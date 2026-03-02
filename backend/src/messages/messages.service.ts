// src/messages/messages.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { RoomsService } from '../rooms/rooms.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private readonly roomsService: RoomsService,
  ) {}

  /**
   * Crée un nouveau message
   */
  async create(messageData: {
    content: string;
    sender: string;
    room: string;
  }): Promise<MessageDocument> {
    const room = await this.roomsService.findById(messageData.room);
    if (!room) throw new NotFoundException('Room not found');

    const message = new this.messageModel({
      sender: messageData.sender,
      room: messageData.room,
      content: messageData.content,
    });
    return message.save();
  }

  /**
   * Trouve un message par son ID
   */
  async findById(id: string): Promise<MessageDocument> {
    const message = await this.messageModel
      .findById(id)
      .populate('sender', 'username email')
      .populate('room', 'name')
      .exec();
    
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    
    return message;
  }

  /**
   * Envoie un message (ancienne méthode pour compatibilité)
   */
  async sendMessage(senderId: string, dto: SendMessageDto): Promise<MessageDocument> {
    return this.create({
      content: dto.content,
      sender: senderId,
      room: dto.roomId,
    });
  }

  /**
   * Trouve tous les messages d'une room
   */
  async findRoomMessages(roomId: string): Promise<MessageDocument[]> {
    const room = await this.roomsService.findById(roomId);
    if (!room) throw new NotFoundException('Room not found');

    return this.messageModel
      .find({ room: roomId })
      .populate('sender', 'username email')
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Marque un message comme lu par un utilisateur
   */
  async markAsRead(messageId: string, userId: string): Promise<MessageDocument> {
    const message = await this.findById(messageId);
    
    // Ajouter l'utilisateur à la liste des lecteurs s'il n'y est pas déjà
    const userIdObj = new Types.ObjectId(userId);
    if (!message.isReadBy.some(id => id.toString() === userId)) {
      message.isReadBy.push(userIdObj);
      await message.save();
    }
    
    return message;
  }

  /**
   * Trouve les messages non lus pour un utilisateur dans une room
   */
  async findUnreadMessages(roomId: string, userId: string): Promise<MessageDocument[]> {
    return this.messageModel
      .find({
        room: roomId,
        sender: { $ne: userId }, // Messages envoyés par d'autres
        isReadBy: { $ne: userId }, // Non lus par l'utilisateur
      })
      .populate('sender', 'username email')
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Supprime un message
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.findById(messageId);
    
    // Vérifier que l'utilisateur est l'auteur du message
    if (message.sender._id.toString() !== userId) {
      throw new NotFoundException('Unauthorized to delete this message');
    }
    
    await this.messageModel.findByIdAndDelete(messageId);
  }

  /**
   * Compte les messages non lus pour un utilisateur
   */
  async countUnreadMessages(userId: string): Promise<number> {
    // Trouver toutes les rooms où l'utilisateur est membre
    const userRooms = await this.roomsService.findByUserId(userId);
    const roomIds = userRooms.map(room => room._id.toString());
    
    return this.messageModel
      .countDocuments({
        room: { $in: roomIds },
        sender: { $ne: userId },
        isReadBy: { $ne: userId },
      })
      .exec();
  }
}