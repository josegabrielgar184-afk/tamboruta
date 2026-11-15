import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Rol, Usuario } from '@/types';

const SUPERADMIN_EMAILS = ['garricraft@gmail.com', 'josegabriel@gmail.com'];

interface AuthState {
  user: (Usuario & { esSuperAdmin?: boolean; plan?: string; fechaVencimiento?: number }) | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  inicializado: boolean;
  init: () => () => void;
  login: (email: string, password: string) => Promise<void>;
  registrar: (
    email: string,
    password: string,
    data: { nombre: string; celular: string; caserio: string }
  ) => Promise<void>;
  logout: () => Promise<void>;
  refrescarPerfil: () => Promise<void>;
  solicitarRol: (rol: Rol) => Promise<void>;
}

const APP_VERSION = '1.0.0';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  firebaseUser: null,
  loading: false,
  inicializado: false,

  init: () => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const perfil = await cargarPerfil(fbUser.uid, fbUser.email);
        set({ firebaseUser: fbUser, user: perfil, inicializado: true });
      } else {
        set({ firebaseUser: null, user: null, inicializado: true });
      }
    });
    return unsub;
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const perfil = await cargarPerfil(cred.user.uid, cred.user.email);
      set({ user: perfil, firebaseUser: cred.user });
    } finally {
      set({ loading: false });
    }
  },

  registrar: async (email, password, data) => {
    set({ loading: true });
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: data.nombre });
      const emailNorm = email.trim().toLowerCase();
      const esAdmin = SUPERADMIN_EMAILS.includes(emailNorm);

      const nuevo: any = {
        uid: cred.user.uid,
        email: emailNorm,
        nombre: data.nombre,
        celular: data.celular,
        rol: esAdmin ? 'super_admin' : 'cliente',
        esSuperAdmin: esAdmin,
        caserio: data.caserio,
        strikes: 0,
        viajes_completados: 0,
        calificacion_promedio: 5,
        fecha_fin_prueba: null,
        ventas_mural_mes: 0,
      };
      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        ...nuevo,
        createdAt: serverTimestamp(),
      });
      set({ user: nuevo, firebaseUser: cred.user });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    // Limpieza inmediata en memoria para destrabar cualquier pantalla
    set({ user: null, firebaseUser: null });
    try {
      await signOut(auth);
    } catch {
      // Si falla red o caché, el estado local ya quedó limpio
    }
  },

  refrescarPerfil: async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    const perfil = await cargarPerfil(fbUser.uid, fbUser.email);
    set({ user: perfil });
  },

  solicitarRol: async (rol: Rol) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const diasGratis = 15;
    const fin = new Date();
    fin.setDate(fin.getDate() + diasGratis);

    await updateDoc(doc(db, 'usuarios', uid), {
      rol,
      plan: 'plata',
      estadoMembresia: 'activa',
      limiteProductos: 12,
      fechaVencimiento: Date.now() + diasGratis * 24 * 60 * 60 * 1000,
      fecha_fin_prueba: fin.toISOString(),
    });
    await get().refrescarPerfil();
  },
}));

async function cargarPerfil(uid: string, email?: string | null) {
  const emailNorm = (email || '').toLowerCase();
  const esAdminEmail = SUPERADMIN_EMAILS.includes(emailNorm);

  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (!snap.exists()) {
    if (esAdminEmail) {
      return {
        uid,
        nombre: 'Super Admin',
        celular: '',
        rol: 'super_admin' as Rol,
        esSuperAdmin: true,
        caserio: 'CP3',
        strikes: 0,
        viajes_completados: 0,
        calificacion_promedio: 5,
        fecha_fin_prueba: null,
        ventas_mural_mes: 0,
      };
    }
    return null;
  }

  const d = snap.data() as any;
  const esSuperAdmin =
    esAdminEmail ||
    d.esSuperAdmin === true ||
    d.rol === 'super_admin' ||
    d.rol === 'superadmin';

  if (esAdminEmail && !d.esSuperAdmin) {
    updateDoc(doc(db, 'usuarios', uid), { esSuperAdmin: true }).catch(() => {});
  }

  return {
    ...d,
    uid,
    nombre: d.nombre ?? '',
    celular: d.celular ?? '',
    rol: d.rol ?? 'cliente',
    esSuperAdmin,
    caserio: d.caserio ?? '',
    strikes: d.strikes ?? 0,
    viajes_completados: d.viajes_completados ?? 0,
    calificacion_promedio: d.calificacion_promedio ?? 5,
    fecha_fin_prueba: d.fecha_fin_prueba ?? null,
    ventas_mural_mes: d.ventas_mural_mes ?? 0,
  };
}

export { APP_VERSION };