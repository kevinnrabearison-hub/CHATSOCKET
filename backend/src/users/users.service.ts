import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Création d'utilisateur avec hash du mot de passe
   */
  async create(data: Partial<User>): Promise<Omit<User, 'password'>> {
    // Vérifier si l'email existe déjà
    const exists = await this.userModel.findOne({ email: data.email });
    if (exists) {
      throw new ConflictException('Email already registered');
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(data.password!, 10);

    const newUser = new this.userModel({
      ...data,
      password: hashedPassword,
    });

    const savedUser = await newUser.save();

    // Créer un nouvel objet sans le mot de passe pour le retour
    const { password, ...userWithoutPassword } = savedUser.toObject();
    return userWithoutPassword;
  }

  /**
   * Retourner tous les utilisateurs sans les mots de passe
   */
  async findAll(): Promise<Omit<User, 'password'>[]> {
    const users = await this.userModel.find().lean().exec();
    return users.map((u) => {
      const { password, ...rest } = u;
      return rest;
    });
  }

  /**
   * Chercher un utilisateur par email (pour login)
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  /**
   * Chercher un utilisateur par id
   */
  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /**
   * Trouve plusieurs utilisateurs par leurs IDs
   */
  async findByIds(ids: string[]): Promise<Omit<User, 'password'>[]> {
    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .lean()
      .exec();
    
    return users.map((u) => {
      const { password, ...rest } = u;
      return rest;
    });
  }

  /**
   * Met à jour le statut en ligne d'un utilisateur
   */
  async setOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { isOnline })
      .exec();
  }

  /**
   * Recherche des utilisateurs par nom ou email
   */
  async search(query: string): Promise<Omit<User, 'password'>[]> {
    const users = await this.userModel
      .find({
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
        ],
      })
      .lean()
      .exec();
    
    return users.map((u) => {
      const { password, ...rest } = u;
      return rest;
    });
  }

  /**
   * Vérifie si un mot de passe est correct
   */
  async validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Met à jour les informations d'un utilisateur
   */
  async update(
    userId: string,
    updateData: Partial<Omit<User, 'password' | '_id'>>,
  ): Promise<Omit<User, 'password'>> {
    // Créer une copie pour pouvoir modifier le password si nécessaire
    const updateCopy: any = { ...updateData };
    
    // Si le mot de passe est fourni, le hasher
    if ('password' in updateData && updateData.password) {
      updateCopy.password = await bcrypt.hash(updateData.password as string, 10);
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, updateCopy, { new: true })
      .lean()
      .exec();

    if (!updatedUser) {
      throw new ConflictException('User not found');
    }

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Supprime un utilisateur
   */
  async delete(userId: string): Promise<void> {
    const result = await this.userModel.findByIdAndDelete(userId);
    if (!result) {
      throw new ConflictException('User not found');
    }
  }

  /**
   * Compte le nombre d'utilisateurs en ligne
   */
  async countOnlineUsers(): Promise<number> {
    return this.userModel.countDocuments({ isOnline: true });
  }
}