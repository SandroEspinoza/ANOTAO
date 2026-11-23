import { Component, EventEmitter, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdminUserItem } from '../../../core/models/user.model';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-panel.component.html',
  styleUrl: './admin-panel.component.css'
})
export class AdminPanelComponent implements OnInit {
  private adminService = inject(AdminService);
  authService = inject(AuthService);

  @Output() cerrar = new EventEmitter<void>();

  usuarios = signal<AdminUserItem[]>([]);
  cargando = signal<boolean>(false);
  busqueda = signal<string>('');
  
  mensajeExito = signal<string | null>(null);
  mensajeError = signal<string | null>(null);

  // Modal para restablecer contraseña
  modalPasswordAbierto = signal<boolean>(false);
  usuarioParaPassword = signal<AdminUserItem | null>(null);
  nuevaPasswordInput = signal<string>('');
  mostrarPassword = signal<boolean>(false);
  guardandoPassword = signal<boolean>(false);

  // Modal para confirmar eliminación
  usuarioParaEliminar = signal<AdminUserItem | null>(null);
  eliminando = signal<boolean>(false);

  // Métricas calculadas
  usuariosFiltrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    if (!q) return this.usuarios();
    return this.usuarios().filter(
      u => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  });

  totalUsuarios = computed(() => this.usuarios().length);
  activosCount = computed(() => this.usuarios().filter(u => u.is_active).length);
  inactivosCount = computed(() => this.usuarios().filter(u => !u.is_active).length);

  parsearFechaLocal(fechaStr: string | Date | undefined): Date | null {
    if (!fechaStr) return null;
    if (typeof fechaStr === 'string') {
      const s = fechaStr.endsWith('Z') || fechaStr.includes('+') ? fechaStr : fechaStr + 'Z';
      return new Date(s);
    }
    return new Date(fechaStr);
  }

  obtenerEstadoUsuario(u: AdminUserItem): {
    codigo: 'ADMIN' | 'ILIMITADO' | 'NUEVO' | 'ACTIVO' | 'POR_VENCER' | 'VENCIDO';
    texto: string;
    claseBorder: string;
    claseBadge: string;
    icono: string;
  } {
    if (u.is_admin) {
      return {
        codigo: 'ADMIN',
        texto: 'Administrador',
        claseBorder: 'card-border-admin',
        claseBadge: 'badge-role-admin',
        icono: '👑'
      };
    }

    if (u.plan_tipo === 'ILIMITADO') {
      return {
        codigo: 'ILIMITADO',
        texto: 'Ilimitado (Sin Pago)',
        claseBorder: 'card-border-unlimited',
        claseBadge: 'badge-plan-unlimited',
        icono: '💎'
      };
    }

    // Nueva cuenta que recién se registró y aún no ha sido activada
    if (!u.is_active && !u.fecha_ultimo_pago && !u.fecha_vencimiento_plan) {
      return {
        codigo: 'NUEVO',
        texto: 'Nueva Cuenta (Espera Confirmación)',
        claseBorder: 'card-border-nuevo',
        claseBadge: 'badge-plan-nuevo',
        icono: '⏳'
      };
    }

    // Activo con pocos días restantes (por vencer <= 5 días)
    if (u.is_active && (u.dias_restantes_plan ?? 0) <= 5 && (u.dias_restantes_plan ?? 0) > 0) {
      const d = u.dias_restantes_plan;
      return {
        codigo: 'POR_VENCER',
        texto: `Por Vencer (${d} día${d === 1 ? '' : 's'} restante${d === 1 ? '' : 's'})`,
        claseBorder: 'card-border-por-vencer',
        claseBadge: 'badge-plan-warning',
        icono: '⚠️'
      };
    }

    // Activo normal al día (> 5 días)
    if (u.is_active && (u.dias_restantes_plan ?? 0) > 5) {
      return {
        codigo: 'ACTIVO',
        texto: `Activo (${u.dias_restantes_plan} días restantes)`,
        claseBorder: 'card-border-activo',
        claseBadge: 'badge-plan-active',
        icono: '🟢'
      };
    }

    // Vencido o suspendido
    return {
      codigo: 'VENCIDO',
      texto: u.fecha_vencimiento_plan ? 'Suscripción Vencida' : 'Acceso Suspendido',
      claseBorder: 'card-border-vencido',
      claseBadge: 'badge-plan-expired',
      icono: '🔴'
    };
  }

  ngOnInit(): void {
    this.cargarUsuarios();
  }

  cargarUsuarios(): void {
    this.cargando.set(true);
    this.mensajeError.set(null);
    this.adminService.obtenerUsuarios().subscribe({
      next: (data) => {
        this.usuarios.set(data);
        this.cargando.set(false);
      },
      error: (err) => {
        this.cargando.set(false);
        this.mensajeError.set(err.error?.detail || 'No se pudieron cargar los usuarios');
      }
    });
  }

  toggleEstado(usuario: AdminUserItem): void {
    const nuevoEstado = !usuario.is_active;
    this.adminService.cambiarEstado(usuario.id, nuevoEstado).subscribe({
      next: (resp: any) => {
        // Actualización inmediata al instante de todos los datos en frontend sin retraso
        this.usuarios.update(list =>
          list.map(u => u.id === usuario.id ? {
            ...u,
            is_active: resp.is_active,
            plan_tipo: resp.plan_tipo ?? u.plan_tipo,
            fecha_vencimiento_plan: resp.fecha_vencimiento_plan,
            fecha_ultimo_pago: resp.fecha_ultimo_pago,
            dias_restantes_plan: resp.dias_restantes_plan
          } : u)
        );
        this.mostrarNotificacion(
          nuevoEstado
            ? `Suscripción de ${usuario.nombre} habilitada correctamente con 1 mes de servicio.`
            : `Acceso de ${usuario.nombre} suspendido.`
        );
      },
      error: (err) => {
        this.mensajeError.set(err.error?.detail || 'Error al cambiar estado');
      }
    });
  }

  renovarPlan(usuario: AdminUserItem, dias: number = 30): void {
    this.adminService.renovarSuscripcion(usuario.id, dias).subscribe({
      next: (resp) => {
        this.usuarios.update(list =>
          list.map(u => u.id === usuario.id ? {
            ...u,
            is_active: true,
            plan_tipo: 'MENSUAL',
            fecha_vencimiento_plan: resp.fecha_vencimiento_plan,
            dias_restantes_plan: resp.dias_restantes_plan
          } : u)
        );
        this.mostrarNotificacion(`Suscripción de ${usuario.nombre} renovada por 1 mes (mismo día del próximo mes).`);
      },
      error: (err) => {
        this.mensajeError.set(err.error?.detail || 'Error al renovar suscripción');
      }
    });
  }

  cambiarTipoPlan(usuario: AdminUserItem, tipo: 'ILIMITADO' | 'MENSUAL'): void {
    this.adminService.cambiarPlan(usuario.id, tipo).subscribe({
      next: (resp) => {
        this.usuarios.update(list =>
          list.map(u => u.id === usuario.id ? {
            ...u,
            plan_tipo: resp.plan_tipo,
            is_active: resp.is_active,
            fecha_vencimiento_plan: resp.fecha_vencimiento_plan,
            dias_restantes_plan: resp.dias_restantes_plan
          } : u)
        );
        const txt = tipo === 'ILIMITADO'
          ? `${usuario.nombre} ahora tiene Plan Ilimitado (exento de pagos).`
          : `${usuario.nombre} pasó a Plan Mensual de 30 días.`;
        this.mostrarNotificacion(txt);
      },
      error: (err) => {
        this.mensajeError.set(err.error?.detail || 'Error al cambiar plan');
      }
    });
  }

  abrirModalPassword(usuario: AdminUserItem): void {
    this.usuarioParaPassword.set(usuario);
    this.nuevaPasswordInput.set('');
    this.mostrarPassword.set(false);
    this.modalPasswordAbierto.set(true);
  }

  cerrarModalPassword(): void {
    this.modalPasswordAbierto.set(false);
    this.usuarioParaPassword.set(null);
    this.nuevaPasswordInput.set('');
  }

  guardarNuevaPassword(): void {
    const user = this.usuarioParaPassword();
    const pass = this.nuevaPasswordInput().trim();
    if (!user) return;
    if (!pass || pass.length < 4) {
      this.mensajeError.set('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }

    this.guardandoPassword.set(true);
    this.adminService.restablecerPassword(user.id, pass).subscribe({
      next: () => {
        this.guardandoPassword.set(false);
        this.cerrarModalPassword();
        this.mostrarNotificacion(`Contraseña actualizada para ${user.nombre}. Nueva clave: ${pass}`);
      },
      error: (err) => {
        this.guardandoPassword.set(false);
        this.mensajeError.set(err.error?.detail || 'Error al restablecer contraseña');
      }
    });
  }

  confirmarEliminar(usuario: AdminUserItem): void {
    this.usuarioParaEliminar.set(usuario);
  }

  ejecutarEliminacion(): void {
    const user = this.usuarioParaEliminar();
    if (!user) return;

    this.eliminando.set(true);
    this.adminService.eliminarUsuario(user.id).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.usuarioParaEliminar.set(null);
        this.usuarios.update(list => list.filter(u => u.id !== user.id));
        this.mostrarNotificacion(`Usuario ${user.nombre} eliminado.`);
      },
      error: (err) => {
        this.eliminando.set(false);
        this.mensajeError.set(err.error?.detail || 'Error al eliminar usuario');
      }
    });
  }

  abrirWhatsAppUsuario(usuario: AdminUserItem): void {
    let num = (usuario.telefono || '').replace(/\D/g, '');
    if (!num) return;
    if (num.length === 9) num = '51' + num;
    const txt = encodeURIComponent(`Hola ${usuario.nombre}, te saluda el administrador de ANOTAO respecto a tu cuenta (${usuario.email}).`);
    window.open(`https://wa.me/${num}?text=${txt}`, '_blank');
  }

  private mostrarNotificacion(msg: string): void {
    this.mensajeExito.set(msg);
    setTimeout(() => this.mensajeExito.set(null), 4000);
  }
}
