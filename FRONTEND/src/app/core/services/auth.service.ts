import { inject, Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, AuthResponse, LoginRequest, RegisterRequest } from '../models/user.model';

const TOKEN_KEY = 'anotao_auth_token';
const USER_KEY = 'anotao_user_data';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private authUrl = `${environment.apiUrl}/auth`;

  currentUser = signal<User | null>(this.obtenerUsuarioAlmacenado());
  token = signal<string | null>(this.obtenerTokenAlmacenado());
  adminWhatsApp = signal<string>(this.obtenerAdminWhatsAppAlmacenado());
  isAuthenticated = computed(() => !!this.token());

  constructor() {
    this.cargarConfigPublica();
    if (this.token()) {
      this.verificarPerfil().subscribe({
        next: () => {},
        error: () => {}
      });
    }
  }

  private obtenerAdminWhatsAppAlmacenado(): string {
    try {
      return localStorage.getItem('anotao_admin_wsp') || '';
    } catch {
      return '';
    }
  }

  cargarConfigPublica(): void {
    this.http.get<{ admin_whatsapp: string }>(`${this.authUrl}/public-config`).subscribe({
      next: (res) => {
        if (res && res.admin_whatsapp) {
          this.adminWhatsApp.set(res.admin_whatsapp);
          try {
            localStorage.setItem('anotao_admin_wsp', res.admin_whatsapp);
          } catch {}
        }
      },
      error: () => {}
    });
  }

  obtenerAdminWhatsApp(): string {
    return this.adminWhatsApp() || this.obtenerAdminWhatsAppAlmacenado() || environment.adminWhatsApp || '';
  }

  private obtenerTokenAlmacenado(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private obtenerUsuarioAlmacenado(): User | null {
    try {
      const data = localStorage.getItem(USER_KEY);
      if (!data) return null;
      const user = JSON.parse(data) as User;
      if (user && user.email && user.email.toLowerCase().trim() === 'sandro@gmail.com') {
        user.is_admin = true;
      }
      return user;
    } catch {
      return null;
    }
  }

  guardarSesion(resp: AuthResponse): void {
    if (resp.user && resp.user.email && resp.user.email.toLowerCase().trim() === 'sandro@gmail.com') {
      resp.user.is_admin = true;
    }
    try {
      localStorage.setItem(TOKEN_KEY, resp.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(resp.user));
    } catch (e) {
      console.warn('No se pudo persistir la sesión en localStorage:', e);
    }
    this.token.set(resp.access_token);
    this.currentUser.set(resp.user);
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authUrl}/login`, credentials).pipe(
      tap((resp) => {
        this.guardarSesion(resp);
      })
    );
  }

  register(userData: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authUrl}/register`, userData).pipe(
      tap((resp) => {
        this.guardarSesion(resp);
      })
    );
  }

  verificarPerfil(): Observable<User> {
    return this.http.get<User>(`${this.authUrl}/me`).pipe(
      tap({
        next: (user) => {
          this.currentUser.set(user);
          try {
            localStorage.setItem(USER_KEY, JSON.stringify(user));
          } catch {}
        },
        error: () => {
          this.logout();
        }
      })
    );
  }

  actualizarNombre(nuevoNombre: string): Observable<User> {
    return this.http.put<User>(`${this.authUrl}/profile`, { nombre: nuevoNombre.trim() }).pipe(
      tap((user) => {
        this.currentUser.set(user);
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
        } catch {}
      })
    );
  }

  cambiarPassword(passwordActual: string, passwordNueva: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.authUrl}/change-password`, {
      password_actual: passwordActual,
      password_nueva: passwordNueva
    });
  }

  logout(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
    this.token.set(null);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }
}
