import { Component, OnInit, OnDestroy, AfterViewChecked } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ChatService, Room, Message } from '../../services/chat.service';
import { AuthService, User } from '../../services/auth.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  rooms: Room[] = [];
  users: User[] = [];
  messages: Message[] = [];
  currentRoom: Room | null = null;
  currentUser: User | null = null;
  isLoading = true;
  messageForm: FormGroup;
  
  private subscriptions: Subscription[] = [];
  private typingTimer: any;
  private messageContainer: HTMLElement | null = null;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.messageForm = this.fb.group({
      content: ['']
    });
  }

  ngOnInit(): void {
    console.log('🚀 Initialisation ChatComponent');
    
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('current_user');
    
    console.log('🔑 Token trouvé:', !!token);
    console.log('👤 User trouvé:', !!userStr);
    
    if (!token || !userStr) {
      console.log('❌ Pas de token ou user, redirection vers login');
      this.router.navigate(['/login']);
      return;
    }
    
    try {
      const user = JSON.parse(userStr);
      console.log('✅ User parsé:', user);
      
      // Normaliser l'ID de l'utilisateur
      if (user._id) {
        user._id = user._id.toString();
      } else if (user.id) {
        user._id = (user as any).id.toString();
        console.log('✅ Normalized user ID:', user._id);
      }
      
      this.currentUser = user;
      this.chatService.connect(); // Initialiser la connexion Socket.IO
      this.loadData();
      this.setupSubscriptions();
    } catch (error) {
      console.error('❌ Erreur parsing user:', error);
      this.logout();
    }
  }

  checkExistingSession(): void {
    const currentSessionId = sessionStorage.getItem('session_id');
    const currentUserId = localStorage.getItem('current_user_id');
    
    if (currentSessionId && currentUserId) {
      // Vérifier si cette session est toujours valide
      const sessionStart = parseInt(sessionStorage.getItem('session_start') || '0');
      const now = Date.now();
      const sessionAge = now - sessionStart;
      
      // Si la session a moins de 5 minutes, considérer comme active
      if (sessionAge < 300000) { // 5 minutes en ms
        console.log('⚠️ Session déjà active, redirection pour éviter duplication');
        this.showSessionConflictNotification();
        this.logout();
        return;
      }
    }
    
    // Créer une nouvelle session
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const userId = this.currentUser?._id || 'unknown';
    
    sessionStorage.setItem('session_id', sessionId);
    sessionStorage.setItem('session_start', Date.now().toString());
    localStorage.setItem('current_user_id', userId);
    
    console.log('🆔 Nouvelle session créée:', sessionId);
    
    // Nettoyer les anciennes sessions expirées
    this.cleanupExpiredSessions();
  }

  cleanupExpiredSessions(): void {
    const sessionStart = sessionStorage.getItem('session_start');
    if (sessionStart) {
      const now = Date.now();
      const sessionAge = now - parseInt(sessionStart);
      
      // Nettoyer les sessions de plus de 30 minutes
      if (sessionAge > 1800000) { // 30 minutes en ms
        console.log('🧹 Nettoyage session expirée');
        sessionStorage.removeItem('session_id');
        sessionStorage.removeItem('session_start');
        localStorage.removeItem('current_user_id');
      }
    }
  }

  showSessionConflictNotification(): void {
    // Créer une notification de conflit de session
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff4444;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 300px;
      animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">⚠️</span>
        <div>
          <strong>Conflit de session détecté</strong><br>
          <small>Vous êtes déjà connecté sur un autre onglet. Cet onglet sera déconnecté.</small>
        </div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-suppression après 5 secondes
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    // Nettoyer la session
    sessionStorage.removeItem('session_id');
    sessionStorage.removeItem('session_start');
    localStorage.removeItem('current_user_id');
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  private loadData(): void {
    this.chatService.getUserRooms().subscribe();
    this.chatService.getAllUsers().subscribe();
    this.chatService.getOnlineUsers();
  }

  private setupSubscriptions(): void {
    // Rooms
    const roomsSub = this.chatService.rooms$.subscribe(rooms => {
      this.rooms = rooms;
      if (rooms.length > 0 && !this.currentRoom) {
        this.selectRoom(rooms[0]);
      }
      this.isLoading = false;
    });

    // Messages
    const messagesSub = this.chatService.messages$.subscribe(messages => {
      console.log('💬 Messages mis à jour:', messages);
      this.messages = messages;
    });

    // Users
    const usersSub = this.chatService.users$.subscribe(users => {
      this.users = users;
    });

    // Online users
    const onlineUsersSub = this.chatService.onlineUsers$.subscribe(users => {
      // Mettre à jour le statut en ligne dans la liste des utilisateurs
      this.users = this.users.map(user => ({
        ...user,
        isOnline: users.some(onlineUser => onlineUser._id === user._id)
      }));
    });

    this.subscriptions.push(roomsSub, messagesSub, usersSub, onlineUsersSub);
  }

  selectRoom(room: Room): void {
    console.log('📍 Sélection de la room:', room);
    console.log('📍 Room members:', room.members);
    console.log('📍 Current user ID:', this.currentUser?._id);
    console.log('📍 Is member check:', room.members.includes(this.currentUser?._id || ''));
    
    this.currentRoom = room;
    this.messages = [];
    this.loadMessages();
    
    // Rejoindre la room via WebSocket
    this.chatService.joinRoom(room._id);
  }

  loadMessages(): void {
    if (this.currentRoom) {
      this.chatService.getRoomMessages(this.currentRoom._id).subscribe();
    }
  }

  sendMessage(): void {
    if (!this.messageForm || !this.currentRoom) {
      return;
    }
    
    const contentControl = this.messageForm.get('content');
    if (!contentControl) {
      return;
    }
    
    const content = contentControl.value?.trim();
    if (content) {
      this.chatService.sendMessage({
        roomId: this.currentRoom._id,
        content
      });
      this.messageForm.reset();
      this.stopTyping();
    }
  }

  onTyping(): void {
    if (this.messageForm && this.currentRoom) {
      this.chatService.sendTyping(this.currentRoom._id, true);
      
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => {
        this.stopTyping();
      }, 1000);
    }
  }

  private stopTyping(): void {
    if (this.currentRoom) {
      this.chatService.sendTyping(this.currentRoom._id, false);
    }
  }

  createPrivateRoom(user: User): void {
    if (this.currentUser && user._id !== this.currentUser._id) {
      console.log('🚀 Démarrage conversation avec:', user.username);
      
      // Vérifier si une room existe déjà entre ces deux utilisateurs
      const existingRoom = this.rooms.find(room => 
        !room.isGroup && 
        room.members.length === 2 &&
        room.members.includes(this.currentUser!._id) &&
        room.members.includes(user._id)
      );

      if (existingRoom) {
        // Si la room existe déjà, la sélectionner directement
        console.log('📍 Conversation existante trouvée avec:', user.username);
        this.selectRoom(existingRoom);
      } else {
        // Sinon créer une nouvelle room privée
        console.log('🏠 Création nouvelle conversation avec:', user.username);
        this.chatService.createPrivateRoom(user._id).subscribe({
          next: (room) => {
            console.log('✅ Conversation créée avec succès:', room);
            this.selectRoom(room);
            // Notification de succès discrète
            this.showNotification(`Conversation démarrée avec ${user.username}`);
          },
          error: (error) => {
            console.error('❌ Erreur création conversation:', error);
            this.showNotification('Erreur lors de la création de la conversation', 'error');
          }
        });
      }
    }
  }

  private showNotification(message: string, type: 'success' | 'error' = 'success'): void {
    // Créer une notification temporaire
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#4caf50' : '#f44336'};
      color: white;
      border-radius: 8px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Supprimer après 3 secondes
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  logout(): void {
    this.authService.logout();
  }

  getRoomDisplayName(room: Room): string {
    if (room.name) {
      return room.name;
    }

    // Pour les rooms privées, afficher le nom de l'autre utilisateur
    const otherUser = room.members.find(memberId => memberId !== this.currentUser?._id);
    const user = this.users.find(u => u._id === otherUser);
    
    return user?.username || 'Utilisateur inconnu';
  }

  isOwnMessage(message: Message): boolean {
    return message.sender._id === this.currentUser?._id;
  }

  isUserOnline(userId: string): boolean {
    return this.users.find(u => u._id === userId)?.isOnline || false;
  }

  // Nouvelles méthodes pour l'interface Messenger
  getOnlineUsers(): User[] {
    return this.users.filter(user => user.isOnline);
  }

  getLastMessage(room: Room): string {
    const roomMessages = this.messages.filter(msg => msg.room === room._id);
    return roomMessages.length > 0 ? roomMessages[roomMessages.length - 1].content : '';
  }

  getLastMessageTime(room: Room): string {
    const roomMessages = this.messages.filter(msg => msg.room === room._id);
    if (roomMessages.length === 0) return '';
    
    const lastMessage = roomMessages[roomMessages.length - 1];
    const now = new Date();
    const messageDate = new Date(lastMessage.createdAt);
    
    if (now.toDateString() === messageDate.toDateString()) {
      return messageDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else {
      return messageDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  }

  getUnreadCount(room: Room): number {
    // Logique à implémenter pour compter les messages non lus
    return 0; // Pour l'instant, retourne 0
  }

  checkUserOnline(room: Room): boolean {
    const otherUserId = room.members.find(memberId => memberId !== this.currentUser?._id);
    const otherUser = this.users.find(user => user._id === otherUserId);
    return otherUser?.isOnline || false;
  }

  getRoomStatus(room: Room): string {
    if (room.isGroup) {
      return `${room.members.length} membres`;
    } else {
      const otherUserId = room.members.find(memberId => memberId !== this.currentUser?._id);
      const otherUser = this.users.find(user => user._id === otherUserId);
      return otherUser?.isOnline ? 'En ligne' : 'Hors ligne';
    }
  }

  formatMessageTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    
    if (now.toDateString() === date.toDateString()) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  private scrollToBottom(): void {
    if (this.messageContainer) {
      this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }
  }

  onMessageContainerScroll(event: Event): void {
    this.messageContainer = event.target as HTMLElement;
  }
}
