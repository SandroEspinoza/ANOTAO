import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { LoanListComponent } from './features/loans/components/loan-list/loan-list.component';
import { LoanFormComponent } from './features/loans/components/loan-form/loan-form.component';
import { LoginComponent } from './features/auth/login/login.component';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    DashboardComponent,
    LoanListComponent,
    LoanFormComponent,
    LoginComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  authService = inject(AuthService);
  tabActiva = signal<string>(this.obtenerTabInicial());
  mostrarModal = signal<boolean>(false);

  private obtenerTabInicial(): string {
    try {
      const guardada = localStorage.getItem('anotao_tab_activa');
      if (guardada === 'dashboard' || guardada === 'prestamos') {
        return guardada;
      }
    } catch {}
    return 'prestamos';
  }

  cambiarTab(tab: string) {
    this.tabActiva.set(tab);
    try {
      localStorage.setItem('anotao_tab_activa', tab);
    } catch {}
  }
}
