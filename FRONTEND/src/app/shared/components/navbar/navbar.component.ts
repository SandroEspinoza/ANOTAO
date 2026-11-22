import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { SyncService } from '../../../core/services/sync.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {
  authService = inject(AuthService);
  syncService = inject(SyncService);
  private elementRef = inject(ElementRef);

  @Input() tabActiva: string = 'prestamos';
  @Output() cambiarTab = new EventEmitter<string>();
  @Output() abrirModalPrestamo = new EventEmitter<void>();

  menuUsuarioAbierto = signal<boolean>(false);
  modalAjustes = signal<boolean>(false);
  pestanaAjustes = signal<'PERFIL' | 'PASSWORD'>('PERFIL');

  nuevoNombreInput = signal<string>('');
  passwordActualInput = signal<string>('');
  passwordNuevaInput = signal<string>('');
  passwordConfirmInput = signal<string>('');
  mostrarPassword = signal<boolean>(false);

  guardando = signal<boolean>(false);
  errorAjustes = signal<string | null>(null);
  exitoAjustes = signal<string | null>(null);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuUsuarioAbierto()) return;
    const target = event.target as HTMLElement;
    const menuContainer = this.elementRef.nativeElement.querySelector('.user-menu-container');
    if (menuContainer && !menuContainer.contains(target)) {
      this.menuUsuarioAbierto.set(false);
    }
  }

  obtenerInicial(nombre?: string): string {
    return nombre ? nombre.trim().charAt(0).toUpperCase() : 'U';
  }

  toggleMenuUsuario(event: MouseEvent): void {
    event.stopPropagation();
    this.menuUsuarioAbierto.update(v => !v);
  }

  cerrarMenuUsuario(): void {
    this.menuUsuarioAbierto.set(false);
  }

  abrirModalAjustes(event: MouseEvent): void {
    event.stopPropagation();
    this.menuUsuarioAbierto.set(false);
    this.pestanaAjustes.set('PERFIL');
    this.nuevoNombreInput.set(this.authService.currentUser()?.nombre || '');
    this.passwordActualInput.set('');
    this.passwordNuevaInput.set('');
    this.passwordConfirmInput.set('');
    this.errorAjustes.set(null);
    this.exitoAjustes.set(null);
    this.modalAjustes.set(true);
  }

  cerrarModalAjustes(): void {
    this.modalAjustes.set(false);
    this.errorAjustes.set(null);
    this.exitoAjustes.set(null);
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword.update(v => !v);
  }

  guardarNombre(): void {
    const nombre = this.nuevoNombreInput().trim();
    if (!nombre || nombre.length < 2) {
      this.errorAjustes.set('El nombre de usuario debe tener al menos 2 caracteres.');
      return;
    }
    this.guardando.set(true);
    this.errorAjustes.set(null);
    this.exitoAjustes.set(null);

    this.authService.actualizarNombre(nombre).subscribe({
      next: () => {
        this.guardando.set(false);
        this.exitoAjustes.set('¡Nombre de usuario actualizado con éxito!');
        setTimeout(() => {
          this.cerrarModalAjustes();
        }, 800);
      },
      error: (err) => {
        this.guardando.set(false);
        const msg = err.error?.detail || 'No se pudo actualizar el nombre';
        this.errorAjustes.set(msg);
      }
    });
  }

  guardarPassword(): void {
    const actual = this.passwordActualInput();
    const nueva = this.passwordNuevaInput();
    const confirmacion = this.passwordConfirmInput();

    if (!actual) {
      this.errorAjustes.set('Por favor ingresa tu contraseña actual.');
      return;
    }
    if (!nueva || nueva.length < 4) {
      this.errorAjustes.set('La nueva contraseña debe tener al menos 4 caracteres.');
      return;
    }
    if (nueva !== confirmacion) {
      this.errorAjustes.set('Las contraseñas nuevas no coinciden.');
      return;
    }

    this.guardando.set(true);
    this.errorAjustes.set(null);
    this.exitoAjustes.set(null);

    this.authService.cambiarPassword(actual, nueva).subscribe({
      next: () => {
        this.guardando.set(false);
        this.exitoAjustes.set('¡Contraseña actualizada con éxito!');
        this.passwordActualInput.set('');
        this.passwordNuevaInput.set('');
        this.passwordConfirmInput.set('');
        setTimeout(() => {
          this.cerrarModalAjustes();
        }, 1000);
      },
      error: (err) => {
        this.guardando.set(false);
        const msg = err.error?.detail || 'Error al cambiar contraseña';
        this.errorAjustes.set(msg);
      }
    });
  }

  cerrarSesion(event: MouseEvent): void {
    event.stopPropagation();
    this.menuUsuarioAbierto.set(false);
    this.authService.logout();
  }
}
