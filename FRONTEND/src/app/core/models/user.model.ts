export interface User {
  id: number;
  nombre: string;
  email: string;
  is_active: boolean;
  is_admin?: boolean;
  telefono?: string;
  plan_tipo?: string;
  fecha_vencimiento_plan?: string | null;
  fecha_ultimo_pago?: string | null;
  dias_restantes_plan?: number | null;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  nombre: string;
  email: string;
  password: string;
  telefono?: string;
}

export interface AdminUserItem {
  id: number;
  nombre: string;
  email: string;
  telefono?: string;
  is_active: boolean;
  is_admin: boolean;
  plan_tipo?: string;
  fecha_vencimiento_plan?: string | null;
  fecha_ultimo_pago?: string | null;
  dias_restantes_plan?: number | null;
  created_at: string;
  prestamos_count: number;
  total_prestado: number;
  total_cobrado: number;
}
