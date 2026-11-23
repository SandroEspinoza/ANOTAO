import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUserItem } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private http = inject(HttpClient);
  private adminUrl = `${environment.apiUrl}/admin`;

  obtenerUsuarios(): Observable<AdminUserItem[]> {
    return this.http.get<AdminUserItem[]>(`${this.adminUrl}/users`);
  }

  obtenerUsuariosPendientes(): Observable<{ id: number; nombre: string; email: string; telefono?: string; created_at: string }[]> {
    return this.http.get<{ id: number; nombre: string; email: string; telefono?: string; created_at: string }[]>(
      `${this.adminUrl}/pending-users`
    );
  }

  cambiarEstado(userId: number, isActive: boolean): Observable<{ message: string; is_active: boolean }> {
    return this.http.put<{ message: string; is_active: boolean }>(
      `${this.adminUrl}/users/${userId}/status`,
      { is_active: isActive }
    );
  }

  restablecerPassword(userId: number, passwordNueva: string): Observable<{ message: string; user_id: number }> {
    return this.http.put<{ message: string; user_id: number }>(
      `${this.adminUrl}/users/${userId}/reset-password`,
      { password_nueva: passwordNueva }
    );
  }

  eliminarUsuario(userId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.adminUrl}/users/${userId}`);
  }

  renovarSuscripcion(userId: number, dias: number = 30): Observable<any> {
    return this.http.put(`${this.adminUrl}/users/${userId}/renew?dias=${dias}`, {});
  }

  cambiarPlan(userId: number, planTipo: 'ILIMITADO' | 'MENSUAL'): Observable<any> {
    return this.http.put(`${this.adminUrl}/users/${userId}/plan?plan_tipo=${planTipo}`, {});
  }
}
