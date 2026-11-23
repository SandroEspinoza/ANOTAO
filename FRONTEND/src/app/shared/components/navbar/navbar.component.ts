import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { AdminService } from '../../../core/services/admin.service';
import { SyncService } from '../../../core/services/sync.service';
import { LoanService } from '../../../features/loans/services/loan.service';
import { AdminPanelComponent } from '../../../features/admin/admin-panel/admin-panel.component';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminPanelComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit {
  authService = inject(AuthService);
  adminService = inject(AdminService);
  syncService = inject(SyncService);
  private elementRef = inject(ElementRef);

  @Input() tabActiva: string = 'prestamos';
  @Output() cambiarTab = new EventEmitter<string>();
  @Output() abrirModalPrestamo = new EventEmitter<void>();

  menuUsuarioAbierto = signal<boolean>(false);
  menuNotificacionesAbierto = signal<boolean>(false);
  modalAjustes = signal<boolean>(false);
  modalAdminAbierto = signal<boolean>(false);
  pestanaAjustes = signal<'PERFIL' | 'PASSWORD'>('PERFIL');

  loanService = inject(LoanService);

  // Notificaciones para Administrador (nuevos registros pendientes)
  usuariosPendientes = signal<{ id: number; nombre: string; email: string; telefono?: string; created_at: string }[]>([]);
  usuariosPendientesCount = computed(() => this.usuariosPendientes().length);

  ngOnInit(): void {
    if (this.esAdmin(this.authService.currentUser())) {
      this.cargarPendientesAdmin();
    }
  }

  cargarPendientesAdmin(): void {
    const user = this.authService.currentUser();
    if (!this.esAdmin(user)) return;
    this.adminService.obtenerUsuariosPendientes().subscribe({
      next: (list) => this.usuariosPendientes.set(list || []),
      error: () => {}
    });
  }
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
    const target = event.target as HTMLElement;
    if (this.menuUsuarioAbierto()) {
      const menuContainer = this.elementRef.nativeElement.querySelector('.user-menu-container');
      if (menuContainer && !menuContainer.contains(target)) {
        this.menuUsuarioAbierto.set(false);
      }
    }
    if (this.menuNotificacionesAbierto()) {
      const notifContainer = this.elementRef.nativeElement.querySelector('.notifications-container');
      if (notifContainer && !notifContainer.contains(target)) {
        this.menuNotificacionesAbierto.set(false);
      }
    }
  }

  obtenerInicial(nombre?: string): string {
    return nombre ? nombre.trim().charAt(0).toUpperCase() : 'U';
  }

  esAdmin(user: any): boolean {
    if (!user) return false;
    if (user.is_admin) return true;
    const email = (user.email || '').toLowerCase().trim();
    return email === 'sandro@gmail.com';
  }

  esIlimitado(user: any): boolean {
    if (!user) return false;
    if (this.esAdmin(user)) return true;
    return user.plan_tipo === 'ILIMITADO';
  }

  toggleMenuUsuario(event: MouseEvent): void {
    event.stopPropagation();
    this.menuUsuarioAbierto.update(v => !v);
  }

  cerrarMenuUsuario(): void {
    this.menuUsuarioAbierto.set(false);
  }

  toggleMenuNotificaciones(event: MouseEvent): void {
    event.stopPropagation();
    this.menuUsuarioAbierto.set(false);
    this.menuNotificacionesAbierto.update(v => !v);
    if (this.menuNotificacionesAbierto() && this.esAdmin(this.authService.currentUser())) {
      this.cargarPendientesAdmin();
    }
  }

  cerrarMenuNotificaciones(): void {
    this.menuNotificacionesAbierto.set(false);
  }

  cobrosReales = computed(() => {
    try {
      const list = this.loanService.prestamos();
      if (!list || list.length === 0) return [];

      const ahora = new Date();
      const anio = ahora.getFullYear();
      const mes = String(ahora.getMonth() + 1).padStart(2, '0');
      const dia = String(ahora.getDate()).padStart(2, '0');
      const hoyStr = `${anio}-${mes}-${dia}`;

      return list.filter(p => {
        if (p.estado === 'PAGADO') return false;
        if (!p.fecha_proximo_pago) return false;

        const cobroStr = p.fecha_proximo_pago.split('T')[0];
        // Solo préstamos cuya fecha de cobro sea HOY o ANTERIOR A HOY (en mora)
        return cobroStr <= hoyStr;
      });
    } catch {
      return [];
    }
  });

  cobrosHoyCount = computed(() => this.cobrosReales().length);

  planInfo = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return null;

    // Los usuarios Administradores o con Plan Ilimitado NUNCA reciben alertas de cobro ni notificaciones estáticas de plan
    if (this.esIlimitado(user)) {
      return null;
    }

    const dias = user.dias_restantes_plan ?? 30;
    const fechaVenc = this.formatearFechaPlan(user.fecha_vencimiento_plan);

    // Solo se notifica si está vencido o a punto de vencer (<= 5 días)
    if (dias <= 0 || !user.is_active) {
      return {
        tipo: 'VENCIDO',
        titulo: '🚨 Suscripción Vencida',
        desc: 'Tu periodo mensual ha finalizado. Contacta al administrador para habilitar tu acceso.',
        icono: '🔴',
        esCritico: true,
        mostrarRenovar: true,
        clase: 'card-expired'
      };
    }

    if (dias <= 5) {
      return {
        tipo: 'POR_VENCER',
        titulo: `⚠️ Plan por vencer en ${dias} día${dias === 1 ? '' : 's'}`,
        desc: `Tu suscripción mensual vence el ${fechaVenc}. Renueva a tiempo para no interrumpir tu servicio.`,
        icono: '⏳',
        esCritico: true,
        mostrarRenovar: true,
        clase: 'card-warning'
      };
    }

    // Activo normal (> 5 días): Notificación de confirmación de suscripción activa y bienvenida
    return {
      tipo: 'ACTIVO',
      titulo: '🎉 ¡Suscripción Mensual Activa!',
      desc: `Tu cuenta cuenta con ${dias} días de servicio activo hasta el ${fechaVenc}. ¡Tus préstamos y cobros están asegurados!`,
      icono: '💎',
      esCritico: false,
      mostrarRenovar: false,
      clase: 'card-active-plan'
    };
  });

  notificacionesCriticasCount = computed(() => {
    let count = 0;
    if (this.esAdmin(this.authService.currentUser())) {
      count += this.usuariosPendientesCount();
    }
    const plan = this.planInfo();
    if (plan && plan.esCritico) count++;
    if (this.cobrosHoyCount() > 0) count++;
    return count;
  });

  tieneNotificaciones = computed(() => {
    if (this.esAdmin(this.authService.currentUser()) && this.usuariosPendientesCount() > 0) return true;
    return !!this.planInfo() || this.cobrosHoyCount() > 0;
  });

  formatearFechaPlan(fechaStr?: string | null): string {
    if (!fechaStr) return 'Próximamente';
    try {
      const d = new Date(fechaStr);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return 'Fecha no disponible';
    }
  }

  contactarRenovacionWhatsApp(): void {
    let adminPhone = this.authService.obtenerAdminWhatsApp().replace(/\D/g, '');
    if (adminPhone.length === 9 && adminPhone.startsWith('9')) {
      adminPhone = '51' + adminPhone;
    }
    if (!adminPhone) return;
    const email = this.authService.currentUser()?.email || '';
    const txt = encodeURIComponent(
      `Hola, soy usuario de ANOTAO (${email}) y deseo renovar mi suscripción mensual de 30 días.`
    );
    window.open(`https://wa.me/${adminPhone}?text=${txt}`, '_blank');
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

  abrirModalAdmin(event: MouseEvent): void {
    event.stopPropagation();
    this.menuUsuarioAbierto.set(false);
    this.modalAdminAbierto.set(true);
  }

  abrirModalAdminDesdeNotif(event: MouseEvent): void {
    event.stopPropagation();
    this.menuNotificacionesAbierto.set(false);
    this.modalAdminAbierto.set(true);
  }

  cerrarModalAdmin(): void {
    this.modalAdminAbierto.set(false);
    this.cargarPendientesAdmin();
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
