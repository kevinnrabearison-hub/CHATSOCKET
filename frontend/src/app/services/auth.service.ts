import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { Router } from '@angular/router';

export interface User {
  _id: string;
  username: string;
  email: string;
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = 'http://localhost:3000'; // URL directe pour éviter les problèmes de proxy
  private readonly TOKEN_KEY = 'access_token';
  private readonly USER_KEY = 'current_user';

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.loadUserProfile();
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    console.log('🔑 Tentative de login vers:', `${this.API_URL}/auth/login`);
    return this.http.post<AuthResponse>(`${this.API_URL}/auth/login`, credentials).pipe(
      tap(response => this.handleAuthSuccess(response))
    );
  }

  register(userData: RegisterRequest): Observable<AuthResponse> {
    console.log('📝 Tentative de register vers:', `${this.API_URL}/auth/register`);
    return this.http.post<AuthResponse>(`${this.API_URL}/auth/register`, userData).pipe(
      tap(response => this.handleAuthSuccess(response))
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken() && !!this.currentUserSubject.value;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  private handleAuthSuccess(response: AuthResponse): void {
    console.log('✅ Auth Success - Response:', response);
    console.log('✅ Token to store:', response.access_token);
    console.log('✅ User to store:', response.user);
    
    // Normaliser l'ID de l'utilisateur pour la cohérence
    const normalizedUser = {
      ...response.user,
      _id: response.user._id || (response.user as any).id // Utiliser _id ou id selon ce qui est disponible
    };
    
    localStorage.setItem(this.TOKEN_KEY, response.access_token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(normalizedUser));
    this.currentUserSubject.next(normalizedUser);
    
    console.log('✅ Token stored:', localStorage.getItem(this.TOKEN_KEY)?.substring(0, 20) + '...');
    console.log('✅ User stored:', localStorage.getItem(this.USER_KEY));
    console.log('✅ Normalized user ID:', normalizedUser._id);
  }

  private loadUserProfile(): void {
    const token = this.getToken();
    const userData = localStorage.getItem(this.USER_KEY);

    if (token && userData) {
      try {
        const user = JSON.parse(userData);
        this.currentUserSubject.next(user);
      } catch (error) {
        console.error('Error parsing user data:', error);
        this.logout();
      }
    }
  }
}
