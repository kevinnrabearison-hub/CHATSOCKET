import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { MessagesService } from '../messages/messages.service';
import { RoomsService } from '../rooms/rooms.service';
import { UsersService } from '../users/users.service';
import { SendMessageDto } from '../messages/dto/send-message.dto';
import { Message } from '../messages/schemas/message.schema';
import { Room } from '../rooms/schemas/room.schema';
import { User } from '../users/schemas/user.schema';

interface AuthenticatedSocket extends Socket {
  userId: string;
  user: Omit<User, 'password'>;
}

interface ClientData {
  userId: string;
  socketId: string;
  joinedRooms: string[];
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200', 'http://localhost:3000'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map des clients connectés
  private connectedClients: Map<string, ClientData> = new Map();

  constructor(
    private readonly authService: AuthService,
    private readonly messagesService: MessagesService,
    private readonly roomsService: RoomsService,
    private readonly usersService: UsersService,
  ) {
    console.log('🔌 ChatGateway initialisé');
  }

  /**
   * Gère la connexion d'un client
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    console.log('🔌 Client connecté:', client.id);

    try {
      // Authentifier le client via le token JWT
      const token = client.handshake.auth.token;
      if (!token) {
        throw new WsException('Token JWT manquant');
      }

      const user = await this.authService.validateToken(token);
      if (!user) {
        throw new WsException('Token JWT invalide');
      }

      // Ajouter les infos utilisateur au socket
      client.userId = (user as any)._id.toString();
      client.user = user;

      // Enregistrer le client
      this.connectedClients.set(client.userId, {
        userId: client.userId,
        socketId: client.id,
        joinedRooms: [],
      });

      // Mettre à jour le statut utilisateur
      await this.usersService.setOnlineStatus((user as any)._id.toString(), true);

      // Notifier les autres que l'utilisateur est en ligne
      client.broadcast.emit('userStatusChanged', {
        userId: client.userId,
        isOnline: true,
      });

      console.log('✅ Client authentifié:', user.username);
      client.emit('authenticated', { user });

    } catch (error: any) {
      console.error('❌ Erreur d\'authentification WebSocket:', error.message);
      client.disconnect();
    }
  }

  /**
   * Gère la déconnexion d'un client
   */
  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    console.log('🔌 Client déconnecté:', client.id);

    if (client.userId) {
      // Retirer le client de la liste
      this.connectedClients.delete(client.userId);

      // Mettre à jour le statut utilisateur
      await this.usersService.setOnlineStatus(client.userId, false);

      // Notifier les autres que l'utilisateur est hors ligne
      client.broadcast.emit('userStatusChanged', {
        userId: client.userId,
        isOnline: false,
      });

      console.log('👤 Utilisateur déconnecté:', client.userId);
    }
  }

  /**
   * Rejoindre une room avec logique améliorée
   */
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    try {
      const { roomId } = data;
      console.log(`🏠 Utilisateur ${client.user.username} tente de rejoindre la room: ${roomId}`);

      // Vérifier que la room existe
      const room = await this.roomsService.findById(roomId);
      if (!room) {
        throw new WsException('Room introuvable');
      }

      // Vérifier que l'utilisateur est membre de la room
      const isMember = room.members.some(
        (member) => member.toString() === client.userId,
      );
      if (!isMember) {
        console.log(`❌ Utilisateur ${client.user.username} n'est pas membre de la room ${roomId}`);
        console.log(`📍 Members de la room:`, room.members.map(m => m.toString()));
        console.log(`📍 User ID:`, client.userId);
        throw new WsException('Accès non autorisé à cette room');
      }

      // Rejoindre la room Socket.IO
      client.join(roomId);
      console.log(`✅ Utilisateur ${client.user.username} a rejoint la room: ${roomId}`);

      // Mettre à jour les rooms rejointes par le client
      const clientData = this.connectedClients.get(client.userId);
      if (clientData && !clientData.joinedRooms.includes(roomId)) {
        clientData.joinedRooms.push(roomId);
        this.connectedClients.set(client.userId, clientData);
      }

      // Notifier les autres membres que l'utilisateur a rejoint
      client.to(roomId).emit('userJoinedRoom', {
        roomId,
        user: {
          _id: client.userId,
          username: client.user.username,
          isOnline: true
        }
      });

      // Confirmer à l'utilisateur qu'il a rejoint
      client.emit('joinedRoom', { roomId });

      // Envoyer la liste des utilisateurs en ligne dans cette room
      const onlineUsersInRoom = await this.getOnlineUsersInRoom(roomId);
      client.emit('onlineUsersInRoom', { roomId, users: onlineUsersInRoom });

    } catch (error: any) {
      console.error('❌ Erreur joinRoom:', error.message);
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Obtenir les utilisateurs en ligne dans une room spécifique
   */
  private async getOnlineUsersInRoom(roomId: string): Promise<any[]> {
    const room = await this.roomsService.findById(roomId);
    if (!room) return [];

    const onlineUsers: any[] = [];
    for (const memberId of room.members) {
      const clientData = this.connectedClients.get(memberId.toString());
      if (clientData) {
        onlineUsers.push({
          _id: memberId.toString(),
          socketId: clientData.socketId,
          isOnline: true,
        });
      }
    }
    return onlineUsers;
  }

  /**
   * Quitter une room
   */
  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    const { roomId } = data;

    client.leave(roomId);

    // Mettre à jour les rooms rejointes par le client
    const clientData = this.connectedClients.get(client.userId);
    if (clientData) {
      clientData.joinedRooms = clientData.joinedRooms.filter(
        (id) => id !== roomId,
      );
      this.connectedClients.set(client.userId, clientData);
    }

    console.log(
      '🚪 Utilisateur',
      client.user.username,
      'a quitté la room:',
      roomId,
    );
    client.emit('leftRoom', { roomId });
  }

  /**
   * Envoyer un message
   */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() messageData: SendMessageDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<Message> {
    try {
      // Vérifier que l'utilisateur est dans la room
      const room = await this.roomsService.findById(messageData.roomId);
      if (!room) {
        throw new WsException('Room introuvable');
      }

      const isMember = room.members.some(
        (member) => member.toString() === client.userId,
      );
      if (!isMember) {
        throw new WsException("Vous n'êtes pas membre de cette room");
      }

      // Créer le message
      const message = await this.messagesService.create({
        content: messageData.content,
        sender: client.userId,
        room: messageData.roomId,
      });

      // Populer les données complètes
      const populatedMessage = await this.messagesService.findById(
        message._id.toString(),
      );

      // Envoyer le message à tous les membres de la room
      this.server.to(messageData.roomId).emit('newMessage', populatedMessage);

      console.log('📤 Message envoyé dans la room:', messageData.roomId);
      return populatedMessage;

    } catch (error: any) {
      console.error('❌ Erreur sendMessage:', error.message);
      client.emit('error', { message: error.message });
      throw new WsException(error.message);
    }
  }

  /**
   * Marquer un message comme lu
   */
  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @MessageBody() data: { messageId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    try {
      await this.messagesService.markAsRead(data.messageId, client.userId);

      // Notifier les autres membres que le message est lu
      client.broadcast.emit('messageRead', {
        messageId: data.messageId,
        userId: client.userId,
      });

    } catch (error: any) {
      console.error('❌ Erreur markAsRead:', error.message);
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Gérer l'état "en train d'écrire"
   */
  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { roomId: string; isTyping: boolean },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): void {
    const { roomId, isTyping } = data;

    // Notifier les autres membres de la room
    client.to(roomId).emit('userTyping', {
      userId: client.userId,
      username: client.user.username,
      isTyping,
    });
  }

  /**
   * Obtenir les utilisateurs en ligne
   */
  @SubscribeMessage('getOnlineUsers')
  async handleGetOnlineUsers(): Promise<Omit<User, 'password'>[]> {
    const onlineUserIds = Array.from(this.connectedClients.keys());
    const onlineUsers = await this.usersService.findByIds(onlineUserIds);
    return onlineUsers;
  }

  /**
   * Obtenir les rooms de l'utilisateur
   */
  @SubscribeMessage('getUserRooms')
  async handleGetUserRooms(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<Room[]> {
    return await this.roomsService.findByUserId(client.userId);
  }

  /**
   * Helper: Envoyer une notification à un utilisateur spécifique
   */
  sendToUser(userId: string, event: string, data: any): void {
    const clientData = this.connectedClients.get(userId);
    if (clientData) {
      this.server.to(clientData.socketId).emit(event, data);
    }
  }

  /**
   * Helper: Envoyer à tous les membres d'une room sauf un utilisateur
   */
  sendToRoomExcept(
    roomId: string,
    exceptUserId: string,
    event: string,
    data: any,
  ): void {
    const clientData = this.connectedClients.get(exceptUserId);
    if (clientData) {
      this.server.to(roomId).except(clientData.socketId).emit(event, data);
    } else {
      this.server.to(roomId).emit(event, data);
    }
  }

  /**
   * Obtenir les statistiques du gateway
   */
  getStats(): {
    connectedClients: number;
    totalRooms: number;
    clientsByRoom: Record<string, number>;
  } {
    const clientsByRoom: Record<string, number> = {};

    this.connectedClients.forEach((client) => {
      client.joinedRooms.forEach((roomId) => {
        clientsByRoom[roomId] = (clientsByRoom[roomId] || 0) + 1;
      });
    });

    return {
      connectedClients: this.connectedClients.size,
      totalRooms: Object.keys(clientsByRoom).length,
      clientsByRoom,
    };
  }
}
