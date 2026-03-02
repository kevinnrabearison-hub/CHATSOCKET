import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Inscription d'un nouvel utilisateur
   */
  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);
    return { user };
  }

  /**
   * Connexion d'un utilisateur
   */
  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordMatching = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordMatching) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user._id, username: user.username };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    };
  }

  /**
   * Validation d'un token JWT pour WebSocket
   */
  async validateToken(token: string): Promise<Omit<User, 'password'> | null> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findById(payload.sub);
      
      if (!user) {
        return null;
      }

      // Retourner l'utilisateur sans le mot de passe
      const { password, ...userWithoutPassword } = user.toObject();
      return userWithoutPassword;

    } catch {
      return null;
    }
  }

  /**
   * Vérification d'un token JWT (pour les guards)
   */
  verifyToken(token: string): any {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Extraction du token depuis le header Authorization
   */
  extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Rafraîchissement d'un token
   */
  refreshToken(user: any): { access_token: string } {
    const payload = { sub: user._id, username: user.username };
    const access_token = this.jwtService.sign(payload);
    return { access_token };
  }
}