import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  esRegistro = signal<boolean>(false);
  cargando = signal<boolean>(false);
  errorMensaje = signal<string | null>(null);

  form = {
    nombre: '',
    email: '',
    password: ''
  };

  toggleModo(): void {
    this.esRegistro.set(!this.esRegistro());
    this.errorMensaje.set(null);
  }

  onSubmit(): void {
    this.errorMensaje.set(null);

    if (this.esRegistro() && !this.form.nombre.trim()) {
      this.errorMensaje.set('Por favor ingresa tu nombre completo o apodo.');
      return;
    }

    if (!this.form.email.trim() || !this.form.password) {
      this.errorMensaje.set('Por favor completa todos los campos requeridos.');
      return;
    }

    if (this.form.password.length < 4) {
      this.errorMensaje.set('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    this.cargando.set(true);

    if (this.esRegistro()) {
      this.authService.register({
        nombre: this.form.nombre.trim(),
        email: this.form.email.trim(),
        password: this.form.password
      }).subscribe({
        next: () => {
          this.cargando.set(false);
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
          this.router.navigateByUrl(returnUrl);
        },
        error: (err) => {
          this.cargando.set(false);
          this.errorMensaje.set(err.error?.detail || 'No se pudo crear la cuenta. Revisa tus datos.');
        }
      });
    } else {
      this.authService.login({
        email: this.form.email.trim(),
        password: this.form.password
      }).subscribe({
        next: () => {
          this.cargando.set(false);
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
          this.router.navigateByUrl(returnUrl);
        },
        error: (err) => {
          this.cargando.set(false);
          this.errorMensaje.set(err.error?.detail || 'Correo o contraseña incorrectos.');
        }
      });
    }
  }
}
