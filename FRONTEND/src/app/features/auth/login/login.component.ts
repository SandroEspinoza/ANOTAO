import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

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
  cuentaPendiente = signal<boolean>(false);
  emailPendiente = signal<string>('');

  form = {
    nombre: '',
    email: '',
    password: '',
    telefono: ''
  };

  toggleModo(): void {
    this.esRegistro.set(!this.esRegistro());
    this.errorMensaje.set(null);
    this.cuentaPendiente.set(false);
  }

  volverAFormulario(): void {
    this.cuentaPendiente.set(false);
    this.errorMensaje.set(null);
  }

  contactarAdminWhatsApp(): void {
    let adminPhone = this.authService.obtenerAdminWhatsApp().replace(/\D/g, '');
    if (adminPhone.length === 9 && adminPhone.startsWith('9')) {
      adminPhone = '51' + adminPhone;
    }
    if (!adminPhone) {
      alert('Número de contacto del administrador no disponible temporalmente.');
      return;
    }
    const email = this.emailPendiente() || this.form.email.trim();
    const txt = encodeURIComponent(
      `Hola, me registré en ANOTAO con el correo ${email} y deseo activar mi suscripción para usar el sistema.`
    );
    window.open(`https://wa.me/${adminPhone}?text=${txt}`, '_blank');
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
        password: this.form.password,
        telefono: this.form.telefono ? this.form.telefono.trim() : undefined
      }).subscribe({
        next: () => {
          this.cargando.set(false);
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
          this.router.navigateByUrl(returnUrl);
        },
        error: (err) => {
          this.cargando.set(false);
          const detail = err.error?.detail || '';
          if (detail.includes('PENDING_SUBSCRIPTION') || err.status === 403) {
            this.emailPendiente.set(this.form.email.trim());
            this.cuentaPendiente.set(true);
          } else {
            this.errorMensaje.set(detail || 'No se pudo crear la cuenta. Revisa tus datos.');
          }
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
          const detail = err.error?.detail || '';
          if (detail.includes('PENDING_SUBSCRIPTION') || err.status === 403) {
            this.emailPendiente.set(this.form.email.trim());
            this.cuentaPendiente.set(true);
          } else if (err.status >= 500) {
            this.errorMensaje.set('Error en el servidor backend. Por favor intenta de nuevo.');
          } else {
            this.errorMensaje.set(detail || 'Correo o contraseña incorrectos.');
          }
        }
      });
    }
  }
}
