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
  isAuthenticated = computed(() => !!this.token());

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
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  guardarSesion(resp: AuthResponse): void {
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
