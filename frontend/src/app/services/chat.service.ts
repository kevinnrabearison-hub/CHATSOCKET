import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { map, tap } from 'rxjs/operators';
import { User } from './auth.service';

export interface Room {
  _id: string;
  members: string[];
  name?: string;
  isGroup: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  sender: User;
  room: string;
  content: string;
  isReadBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageRequest {
  roomId: string;
  content: string;
}

export interface CreatePrivateRoomRequest {
  userId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly API_URL = ''; // Utilise le proxy Angular
  private socket!: Socket; // Assertion non-null

  // Subjects pour les données en temps réel
  private messagesSubject = new BehaviorSubject<Message[]>([]);
  private roomsSubject = new BehaviorSubject<Room[]>([]);
  private usersSubject = new BehaviorSubject<User[]>([]);
  private onlineUsersSubject = new BehaviorSubject<User[]>([]);

  // Observables publics
  public messages$ = this.messagesSubject.asObservable();
  public rooms$ = this.roomsSubject.asObservable();
  public users$ = this.usersSubject.asObservable();
  public onlineUsers$ = this.onlineUsersSubject.asObservable();

  constructor(
    private http: HttpClient
  ) {
    // Ne pas se connecter automatiquement dans le constructeur
    // La connexion se fera via la méthode connect() après authentification
  }

  // Connexion Socket.IO
  connect(): void {
    const token = localStorage.getItem('access_token');
    console.log('Tentative de connexion Socket.IO avec token:', token ? 'présent' : 'manquant');
    console.log('Token JWT:', token?.substring(0, 20) + '...');
    
    if (token) {
      this.socket = io('', { // Utilise le proxy Angular
        auth: { token: token.replace('Bearer ', '').trim() }, // Format correct pour Socket.IO
        transports: ['websocket', 'polling']
      });
      
      this.socket.on('connect', () => {
        console.log('✅ Socket.IO connecté avec succès');
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('❌ Erreur de connexion Socket.IO:', error.message);
        console.error('Détail erreur:', error);
      });
      
      this.setupSocketListeners();
    } else {
      console.error('❌ Token JWT manquant pour la connexion Socket.IO');
    }
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  // API REST
  getUserRooms(): Observable<Room[]> {
    return this.http.get<Room[]>(`${this.API_URL}/rooms`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
    }).pipe(
      tap(rooms => this.roomsSubject.next(rooms))
    );
  }

  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.API_URL}/users`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
    }).pipe(
      tap(users => this.usersSubject.next(users))
    );
  }

  createPrivateRoom(userId: string): Observable<Room> {
    return this.http.post<Room>(`${this.API_URL}/rooms/private`, 
      { userId }, 
      { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
    });
  }

  getRoomMessages(roomId: string): Observable<Message[]> {
    return this.http.get<Message[]>(`${this.API_URL}/messages/${roomId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
    }).pipe(
      tap(messages => this.messagesSubject.next(messages))
    );
  }

  sendMessage(request: SendMessageRequest): void {
    console.log('📤 Envoi message via WebSocket:', request);
    this.socket.emit('sendMessage', request);
  }

  // WebSocket Events
  joinRoom(roomId: string): void {
    this.socket.emit('joinRoom', { roomId });
  }

  leaveRoom(roomId: string): void {
    this.socket.emit('leaveRoom', { roomId });
  }

  markAsRead(messageId: string): void {
    this.socket.emit('markAsRead', { messageId });
  }

  sendTyping(roomId: string, isTyping: boolean): void {
    this.socket.emit('typing', { roomId, isTyping });
  }

  getOnlineUsers(): void {
    this.socket.emit('getOnlineUsers');
  }

  // Socket Listeners
  private setupSocketListeners(): void {
    // Nouveau message reçu
    this.socket.on('newMessage', (message: any) => {
      console.log('📨 Nouveau message reçu:', message);
      const currentMessages = this.messagesSubject.value;
      this.messagesSubject.next([...currentMessages, message]);
    });

    // Message lu
    this.socket.on('messageRead', (data: any) => {
      const currentMessages = this.messagesSubject.value;
      const updatedMessages = currentMessages.map(msg => 
        msg._id === data.messageId 
          ? { ...msg, isReadBy: [...msg.isReadBy, data.userId] }
          : msg
      );
      this.messagesSubject.next(updatedMessages);
    });

    // Statut utilisateur changé
    this.socket.on('userStatusChanged', (data: any) => {
      const currentUsers = this.usersSubject.value;
      const updatedUsers = currentUsers.map(user => 
        user._id === data.userId 
          ? { ...user, isOnline: data.isOnline }
          : user
      );
      this.usersSubject.next(updatedUsers);

      // Mettre à jour la liste des utilisateurs en ligne
      if (data.isOnline) {
        const onlineUsers = this.onlineUsersSubject.value;
        if (!onlineUsers.find(u => u._id === data.userId)) {
          const userToAdd = updatedUsers.find(u => u._id === data.userId);
          if (userToAdd) {
            this.onlineUsersSubject.next([...onlineUsers, userToAdd]);
          }
        }
      } else {
        const onlineUsers = this.onlineUsersSubject.value;
        this.onlineUsersSubject.next(onlineUsers.filter(u => u._id !== data.userId));
      }
    });

    // Utilisateurs en ligne
    this.socket.on('getOnlineUsers', (users: any) => {
      this.onlineUsersSubject.next(users);
    });

    // Rooms utilisateur
    this.socket.on('getUserRooms', (rooms: any) => {
      this.roomsSubject.next(rooms);
    });
  }
}
