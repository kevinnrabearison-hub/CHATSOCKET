import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService, LoginRequest, RegisterRequest } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  loginForm: FormGroup;
  registerForm: FormGroup;
  isLoading = false;
  isLoginMode = true;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onLogin(): void {
    if (this.loginForm.valid) {
      this.isLoading = true;
      const loginData: LoginRequest = this.loginForm.value;
      
      this.authService.login(loginData).subscribe({
        next: () => {
          this.router.navigate(['/chat']);
          alert('Connexion réussie!');
        },
        error: (error) => {
          alert('Erreur de connexion: ' + error.error.message);
          this.isLoading = false;
        }
      });
    }
  }

  onRegister(): void {
    if (this.registerForm.valid) {
      this.isLoading = true;
      const registerData: RegisterRequest = this.registerForm.value;
      
      this.authService.register(registerData).subscribe({
        next: (response) => {
          console.log('✅ Inscription réussie:', response);
          console.log('✅ Token reçu:', response.access_token?.substring(0, 20) + '...');
          console.log('✅ Utilisateur reçu:', response.user);
          
          // Après inscription, on déconnecte et on redirige vers login
          this.authService.logout();
          this.isLoading = false;
          
          // Passer en mode login et afficher un message de succès
          this.isLoginMode = true;
          alert('Inscription réussie! Vous pouvez maintenant vous connecter.');
        },
        error: (error) => {
          console.error('❌ Erreur inscription:', error);
          alert('Erreur d\'inscription: ' + error.error.message);
          this.isLoading = false;
        }
      });
    }
  }

  switchMode(): void {
    this.isLoginMode = !this.isLoginMode;
  }
}
