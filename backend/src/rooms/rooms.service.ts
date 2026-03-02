import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Room, RoomDocument } from './schemas/room.schema';

@Injectable()
export class RoomsService {
  constructor(@InjectModel(Room.name) private roomModel: Model<RoomDocument>) {}

  /**
   * Création d'une room privée avec anti-duplication et améliorations
   */
  async createPrivateRoom(participants: string[]): Promise<RoomDocument> {
    const participantIds = participants.map(p => new Types.ObjectId(p));
    
    if (participants[0] === participants[1]) {
      throw new BadRequestException(
        'Cannot create a private room with yourself',
      );
    }

    // Vérifie si une room existe déjà avec ces participants (ordre indifférent)
    const existing = await this.roomModel.findOne({
      members: { $all: participantIds, $size: 2 },
      isGroup: false
    });

    if (existing) {
      console.log('📍 Room privée existante trouvée:', existing._id);
      return existing;
    }

    // Créer une nouvelle room privée avec des métadonnées
    const newRoom = new this.roomModel({ 
      members: participantIds,
      isGroup: false,
      name: null, // Les rooms privées n'ont pas de nom
      createdBy: participantIds[0] // Le premier participant est le créateur
    });
    
    const savedRoom = await newRoom.save();
    console.log('🏠 Nouvelle room privée créée:', savedRoom._id);
    return savedRoom;
  }

  /**
   * Liste des rooms d'un utilisateur
   */
  async findUserRooms(userId: string): Promise<RoomDocument[]> {
    const userObjectId = new Types.ObjectId(userId);
    return this.roomModel.find({ members: userObjectId }).exec();
  }

  /**
   * Alias pour findUserRooms (utilisé dans le gateway)
   */
  async findByUserId(userId: string): Promise<RoomDocument[]> {
    return this.findUserRooms(userId);
  }

  /**
   * Trouver une room par son ID
   */
  async findById(id: string): Promise<RoomDocument | null> {
    return this.roomModel.findById(id).exec();
  }

  /**
   * Créer une room de groupe
   */
  async createGroupRoom(data: {
    name: string;
    members: string[];
    createdBy: string;
  }): Promise<RoomDocument> {
    const memberIds = [
      ...data.members.map(m => new Types.ObjectId(m)),
      new Types.ObjectId(data.createdBy),
    ];
    
    const newRoom = new this.roomModel({
      name: data.name,
      members: memberIds,
      isGroup: true,
      createdBy: new Types.ObjectId(data.createdBy),
    });
    return newRoom.save();
  }

  /**
   * Ajouter un membre à une room
   */
  async addMember(roomId: string, userId: string): Promise<RoomDocument> {
    const room = await this.findById(roomId);
    if (!room) {
      throw new BadRequestException('Room not found');
    }

    const userObjectId = new Types.ObjectId(userId);
    if (room.members.some(member => member.toString() === userId)) {
      throw new BadRequestException('User already in room');
    }

    room.members.push(userObjectId);
    return room.save();
  }

  /**
   * Retirer un membre d'une room
   */
  async removeMember(roomId: string, userId: string): Promise<RoomDocument> {
    const room = await this.findById(roomId);
    if (!room) {
      throw new BadRequestException('Room not found');
    }

    room.members = room.members.filter(
      (member) => member.toString() !== userId,
    );
    return room.save();
  }

  /**
   * Supprimer une room
   */
  async delete(roomId: string, userId: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) {
      throw new BadRequestException('Room not found');
    }

    // Vérifier que l'utilisateur est le créateur ou un admin
    if (room.createdBy && room.createdBy.toString() !== userId) {
      throw new BadRequestException('Only room creator can delete the room');
    }

    await this.roomModel.findByIdAndDelete(roomId);
  }

  /**
   * Mettre à jour le nom d'une room
   */
  async updateName(roomId: string, name: string, userId: string): Promise<RoomDocument> {
    const room = await this.findById(roomId);
    if (!room) {
      throw new BadRequestException('Room not found');
    }

    // Vérifier que l'utilisateur est le créateur
    if (room.createdBy && room.createdBy.toString() !== userId) {
      throw new BadRequestException('Only room creator can update the room');
    }

    room.name = name;
    return room.save();
  }

  /**
   * Obtenir les détails d'une room avec les membres peuplés
   */
  async findByIdWithMembers(roomId: string): Promise<RoomDocument | null> {
    return this.roomModel
      .findById(roomId)
      .populate('members', 'username email isOnline')
      .populate('createdBy', 'username email')
      .exec();
  }

  /**
   * Vérifier si un utilisateur est membre d'une room
   */
  async isUserMember(roomId: string, userId: string): Promise<boolean> {
    const room = await this.findById(roomId);
    return room ? room.members.some(member => member.toString() === userId) : false;
  }
}