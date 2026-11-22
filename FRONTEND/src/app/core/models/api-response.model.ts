export interface HealthStatusResponse {
  estado: string;
  mensaje: string;
  servicios?: {
    backend: string;
    base_datos: string;
  };
}
