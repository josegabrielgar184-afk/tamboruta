export type Rol =
  | 'cliente'
  | 'chofer'
  | 'tienda'
  | 'moderador'
  | 'super_admin'
  | 'admin'
  | 'ayudante';

export const ROLES_ADMIN = ['super_admin', 'admin', 'ayudante', 'moderador'] as const;
export const esRolAdmin = (rol: Rol | undefined | null): boolean =>
  !!rol && (ROLES_ADMIN as readonly string[]).includes(rol);

export type CategoriaTienda = 'Bodegas' | 'Ferreterías' | 'Carnicerías' | 'Farmacias';

export interface Coordenada {
  latitude: number;
  longitude: number;
}

export interface Usuario {
  uid: string;
  nombre: string;
  celular: string;
  rol: Rol;
  caserio: string;
  strikes: number;
  viajes_completados: number;
  calificacion_promedio: number;
  fecha_fin_prueba: string | null;
  ventas_mural_mes: number;
  placa?: string;
}

export interface Solicitud {
  id: string;
  clienteUid: string;
  clienteNombre: string;
  caserio: string;
  destino: string;
  precio: number;
  estado: 'abierta' | 'aceptada' | 'finalizada';
  createdAt: any;
  origen?: Coordenada;
  origenCoords?: Coordenada;
  destinoCoords?: Coordenada;
  origenLat?: number;
  origenLng?: number;
  destinoLat?: number;
  destinoLng?: number;
  precioOferta?: number;
  choferUid?: string;
  choferNombre?: string;
  precioAcordado?: number;
}

export interface ChatData {
  solicitudId?: string;
  clienteUid: string;
  choferUid: string;
  clienteNombre: string;
  choferNombre: string;
  destino: string;
  origen: string;
  precio: number;
  precioAcordado: number;
  estado: 'en_curso' | 'finalizado' | 'cancelado';
  origenLat?: number;
  origenLng?: number;
  destinoLat?: number;
  destinoLng?: number;
  choferLat?: number;
  choferLng?: number;
}

export interface Mensaje {
  id: string;
  senderUid: string;
  senderNombre: string;
  texto: string;
  tipo: 'texto' | 'audio' | 'imagen' | 'sistema';
  leido?: boolean;
  imageUrl?: string;
  audioUrl?: string;
  createdAt: any;
}
