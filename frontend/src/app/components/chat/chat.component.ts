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
    this.currentUser = this.authService.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.chatService.connect();
    this.loadData();
    this.setupSubscriptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.chatService.disconnect();
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
    if (this.currentRoom) {
      this.chatService.leaveRoom(this.currentRoom._id);
    }

    this.currentRoom = room;
    this.chatService.joinRoom(room._id);
    this.chatService.getRoomMessages(room._id).subscribe();
  }

  sendMessage(): void {
    const content = this.messageForm.get('content')?.value.trim();
    if (content && this.currentRoom) {
      this.chatService.sendMessage({
        roomId: this.currentRoom._id,
        content
      }).subscribe({
        next: () => {
          this.messageForm.reset();
          this.stopTyping();
        },
        error: (error) => {
          alert('Erreur lors de l\'envoi du message');
        }
      });
    }
  }

  onTyping(): void {
    if (this.currentRoom) {
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
      this.chatService.createPrivateRoom(user._id).subscribe({
        next: (room) => {
          this.selectRoom(room);
          alert(`Conversation privée créée avec ${user.username}`);
        },
        error: (error) => {
          alert('Erreur lors de la création de la conversation');
        }
      });
    }
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

  getOtherUsers(): User[] {
    return this.users.filter(user => user._id !== this.currentUser?._id);
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
