import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  runTransaction,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  MapPin,
  Navigation,
  Tag,
  Clock,
  Gavel,
  X,
  Car,
  Star,
  Trash2,
  Lock,
  CheckCircle2,
  MessageCircle,
  Eye,
  EyeOff,
  Users,
  Zap,
  HelpCircle,
  ShieldCheck,
  Send,
  PlayCircle,
  BarChart3,
} from 'lucide-react-native';
import { db, auth } from '@/lib/firebase';
import { MapaZona, MapaSelector, MotoCercana } from '@/components/MapaZona';
import { useAuthStore } from '@/store/useAuthStore';
import { useSoundAlerta } from '@/hooks/useSoundAlerta';
import { scheduleNotification } from '@/lib/notificaciones';

import type { Solicitud, Coordenada } from '@/types';

let VideoComponent: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  VideoComponent = require('expo-av').Video;
} catch {}

interface ContraOferta {
  id: string;
  solicitudId?: string;
  choferUid: string;
  choferNombre: string;
  choferPlan?: string;
  precio: number;
  calificacion: number;
  createdAt?: any;
}

const ZONA_DEFAULT = {
  latitude: -5.0561,
  longitude: -80.3472,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

const DESTINOS_FRECUENTES = [
  { id: 'tg_centro', nombre: 'Tambogrande Centro', lat: -5.0561, lng: -80.3472, tarifa: 7 },
  { id: 'mercado', nombre: 'Mercado Central', lat: -5.0546, lng: -80.3452, tarifa: 7 },
  { id: 'cp3_casa', nombre: 'CP3 / Sector Cólera', lat: -5.0185, lng: -80.319, tarifa: 7 },
  { id: 'cp3_paradero', nombre: 'CP3 Paradero', lat: -5.021, lng: -80.3215, tarifa: 6 },
  { id: 'hualtaco', nombre: 'Hualtaco', lat: -5.029, lng: -80.328, tarifa: 5 },
  { id: 'cp2', nombre: 'CP2', lat: -5.037, lng: -80.334, tarifa: 3 },
  { id: 'vallecito', nombre: 'Vallecito', lat: -5.026, lng: -80.326, tarifa: 7 },
  { id: 'sanjuan', nombre: 'Valle de San Juan', lat: -5.005, lng: -80.308, tarifa: 8 },
  { id: 'cp4', nombre: 'CP4 Bajo', lat: -4.996, lng: -80.301, tarifa: 8 },
  { id: 'cp11', nombre: 'CP11', lat: -4.989, lng: -80.295, tarifa: 9 },
  { id: 'cp12', nombre: 'CP12', lat: -4.982, lng: -80.288, tarifa: 9 },
];

const GUIA_CONTENIDO = {
  pasajeros: [
    {
      titulo: '1. Pide mototaxi con GPS exacto',
      desc: 'Toca "Nueva solicitud de ruta", activa tu GPS con un botón, elige tu destino en Tambogrande o los caseríos y propón tu tarifa.',
    },
    {
      titulo: '2. Cupo Compartido o Carrera Expresa',
      desc: 'Elige "Cupo Compartido" si vas en ruta troncal (CP3 - Hualtaco - CP2 - Tambogrande) para pagar tarifa económica, o "Expreso" para ir directo sin esperar.',
    },
    {
      titulo: '3. Modo Mandado y Tienda Local',
      desc: 'Activa "Modo Mandado" para encargos sin viajar. En la pestaña Tienda puedes pedir comida o abarrotes con tu DNI y ver qué locales están abiertos.',
    },
  ],
  choferes: [
    {
      titulo: '1. Llena tu mototaxi sin perder tiempo',
      desc: 'Usa el selector "Asientos libres en moto" (1 o 2 cupos) cuando vayas rumbo a Tambogrande para sumar pasajeros en el camino.',
    },
    {
      titulo: '2. Ventaja de 15s y 30s por Rango',
      desc: 'Arrancas con 15 días gratis. Los rangos Platino reciben rutas 15s antes, y Oro / Premium las ven al instante (30s antes) y aparecen #1 en ofertas.',
    },
    {
      titulo: '3. Modo Sin Señal (CP11 / CP12)',
      desc: 'Al aceptar un viaje se genera un PIN de 4 dígitos. Si se va la señal en zonas rurales, puedes cerrar la carrera igual y se sincroniza al volver.',
    },
  ],
  tiendas: [
    {
      titulo: '1. Interruptor Abierto / Cerrado',
      desc: 'Desde tu Perfil puedes abrir o cerrar tu negocio en un toque. Cuando cierras, tus productos salen en gris para evitar pedidos fuera de horario.',
    },
    {
      titulo: '2. Bandeja Digital (Adiós al cuaderno)',
      desc: 'En "Mis Pedidos" recibes cada reserva ordenada con cantidad, total en soles, DNI de 8 dígitos y caserío de entrega.',
    },
    {
      titulo: '3. Anuncios Modo Flash (24 horas)',
      desc: 'Toca el botón amarillo "Flash" en Tienda para destacar tus ofertas arriba de todos por 24 horas (gratis en planes Oro/Premium o S/ 3 con Yape).',
    },
  ],
  seguridad: [
    {
      titulo: '1. Verifica siempre la placa',
      desc: 'Antes de subir a la mototaxi, confirma que la placa y el nombre del chofer coincidan con la tarjeta del viaje en curso.',
    },
    {
      titulo: '2. Mural Comunal Seguro',
      desc: 'En el Mural está prohibido publicar teléfonos personales o enlaces. Toda coordinación de chambas o avisos es visible y segura dentro de la app.',
    },
    {
      titulo: '3. Burbuja flotante de viaje',
      desc: 'Si sales del chat mientras viajas, una burbuja verde flotante te avisará si llegan mensajes nuevos para volver con un toque.',
    },
  ],
};

function getPesoPlanChofer(plan?: string): number {
  const p = (plan || 'plata').toLowerCase();
  if (p === 'premium') return 4;
  if (p === 'oro') return 3;
  if (p === 'platino') return 2;
  return 1;
}

function getEtiquetaPlanChofer(plan?: string): string {
  const p = (plan || 'plata').toLowerCase();
  if (p === 'premium') return '💎 VIP';
  if (p === 'oro') return '🥇 Oro';
  if (p === 'platino') return '💠 Platino';
  return '';
}

function calcularDistanciaHaversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatearDistancia(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

async function obtenerNombreLugar(lat: number, lng: number): Promise<string> {
  for (const d of DESTINOS_FRECUENTES) {
    if (calcularDistanciaHaversine(lat, lng, d.lat, d.lng) < 0.45) {
      return d.nombre;
    }
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17`,
      {
        headers: { 'User-Agent': 'TamboRutaApp/1.0' },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    const json = await resp.json();
    const addr = json?.address || {};
    const calle = addr.road || addr.pedestrian || addr.neighbourhood || '';
    const sector =
      addr.suburb || addr.village || addr.hamlet || addr.town || addr.city || 'Tambogrande';
    if (calle && sector && calle !== sector) return `${calle}, ${sector}`;
    if (sector) return `Sector ${sector}`;
  } catch {}
  return 'Punto marcado en mapa (Tambogrande)';
}

export default function RutasScreen() {
  const storeUser = useAuthStore((s: any) => s.user);
  const uid = storeUser?.uid || auth.currentUser?.uid;
  const router = useRouter();
  const { reproducir } = useSoundAlerta();

  const [modalBienvenida, setModalBienvenida] = useState(false);
  const [modalAyuda, setModalAyuda] = useState(false);
  const [tabGuia, setTabGuia] = useState<'pasajeros' | 'choferes' | 'tiendas' | 'seguridad'>(
    'pasajeros'
  );
  const [mensajeSupervisor, setMensajeSupervisor] = useState('');

  // Video Promo / Novedad con Omitir y No volver a mostrar
  const [videoPromo, setVideoPromo] = useState<{ videoUrl: string; clave: string } | null>(null);
  const [modalVideoPromo, setModalVideoPromo] = useState(false);

  // Encuesta Interactiva Real con opciones y votos
  const [encuesta, setEncuesta] = useState<any>(null);
  const [modalEncuesta, setModalEncuesta] = useState(false);
  const [opcionEncuestaSel, setOpcionEncuestaSel] = useState<string | null>(null);

  const [solicitudesRaw, setSolicitudesRaw] = useState<Solicitud[]>([]);
  const [ahoraTick, setAhoraTick] = useState(() => Date.now());
  const [filtroLista, setFiltroLista] = useState<'todas' | 'compartidos' | 'mandados' | 'mias'>(
    'todas'
  );
  const [mostrarMapaRadar, setMostrarMapaRadar] = useState(true);

  const [ofertasFlashHome, setOfertasFlashHome] = useState<any[]>([]);

  const [viajeActivo, setViajeActivo] = useState<{
    id: string;
    contraparte: string;
    precio: number;
  } | null>(null);
  const [mensajesSinLeer, setMensajesSinLeer] = useState(0);

  const [cuposLibresChofer, setCuposLibresChofer] = useState<number>(0);

  const [motosEnLinea, setMotosEnLinea] = useState<MotoCercana[]>([]);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalMapaDestino, setModalMapaDestino] = useState(false);
  const [modalOfertas, setModalOfertas] = useState<Solicitud | null>(null);
  const [ofertas, setOfertas] = useState<ContraOferta[]>([]);
  const [modalContraofertar, setModalContraofertar] = useState<Solicitud | null>(null);
  const [precioContraoferta, setPrecioContraoferta] = useState('');

  const [loading, setLoading] = useState(true);
  const [timeoutActivo, setTimeoutActivo] = useState(false);
  const [aceptandoId, setAceptandoId] = useState<string | null>(null);
  const [buscandoNombreLugar, setBuscandoNombreLugar] = useState(false);

  const [origenTexto, setOrigenTexto] = useState('');
  const [destino, setDestino] = useState('');
  const [referencia, setReferencia] = useState('');
  const [precio, setPrecio] = useState('6');
  const [esMandado, setEsMandado] = useState(false);
  const [modalidadViaje, setModalidadViaje] = useState<'compartido' | 'solo'>('compartido');
  const [cantidadPasajeros, setCantidadPasajeros] = useState<1 | 2 | 3>(1);

  const [origen, setOrigen] = useState<Coordenada | null>(null);
  const [destinoCoord, setDestinoCoord] = useState<Coordenada | null>(null);
  const [regionActual, setRegionActual] = useState(ZONA_DEFAULT);
  const [ubicando, setUbicando] = useState(false);
  const [perfil, setPerfil] = useState<any>(null);
  const prevVisibleCountRef = useRef(0);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'usuarios', uid), (snap) => {
      const data = snap.data() || null;
      setPerfil(data);
      if (typeof data?.cuposLibres === 'number') {
        setCuposLibresChofer(data.cuposLibres);
      }
      if (data?.rol === 'chofer') setTabGuia('choferes');
      else if (data?.rol === 'tienda') setTabGuia('tiendas');
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const timer = setInterval(() => setAhoraTick(Date.now()), 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const qFlash = query(collection(db, 'productos'), where('flash', '==', true));
    const unsub = onSnapshot(qFlash, (snap) => {
      const ahora = Date.now();
      const vigentes: any[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        if (data.activo !== false && (!data.flashExpiraEn || data.flashExpiraEn > ahora)) {
          vigentes.push({ id: d.id, ...data });
        }
      });
      setOfertasFlashHome(vigentes);
    });
    return () => unsub();
  }, []);

  const rolActual = (perfil?.rol || storeUser?.rol) as string | undefined;
  const esChofer = rolActual === 'chofer';
  const esClienteOtienda =
    rolActual === 'pasajero' || rolActual === 'cliente' || rolActual === 'tienda';

  const planChofer = (perfil?.plan || 'plata').toLowerCase();
  const retrasoSegundosChofer =
    planChofer === 'premium' || planChofer === 'oro' ? 0 : planChofer === 'platino' ? 15 : 30;

  const membresiaVencida =
    esChofer && (!perfil?.fechaVencimiento || perfil.fechaVencimiento < Date.now());
  const cuentaEnRevision = esChofer && perfil?.estadoMembresia === 'pendiente';
  const montoRenovacion = 'S/ 10.00';

  const gananciaHoy = Number(perfil?.gananciaHoy || 0);
  const metaDiaria = 50;
  const progresoMeta = Math.min(100, Math.round((gananciaHoy / metaDiaria) * 100));

  const actualizarCuposChofer = async (nuevosCupos: number) => {
    setCuposLibresChofer(nuevosCupos);
    if (!uid) return;
    await updateDoc(doc(db, 'usuarios', uid), { cuposLibres: nuevosCupos }).catch(() => {});
  };

  useEffect(() => {
    const q = query(
      collection(db, 'usuarios'),
      where('rol', '==', 'chofer'),
      where('enLinea', '==', true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const activas: MotoCercana[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const vigente = data.fechaVencimiento && data.fechaVencimiento > Date.now();
        if (vigente && typeof data.lat === 'number' && typeof data.lng === 'number') {
          activas.push({
            id: d.id,
            nombre: data.nombre || 'Chofer',
            latitude: data.lat,
            longitude: data.lng,
          });
        }
      });
      setMotosEnLinea(activas);
    });
    return () => unsub();
  }, []);

  // Carga Bienvenida, Video Novedad y Encuesta Activa
  useEffect(() => {
    AsyncStorage.getItem('tamboruta_onboarding_visto').then((visto) => {
      if (!visto) setModalBienvenida(true);
    });

    const unsubVideo = onSnapshot(doc(db, 'configuracion', 'video_promo'), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      if (data.activo && data.videoUrl) {
        const clave = `video_no_mostrar_${data.videoUrl.slice(-24)}`;
        AsyncStorage.getItem(clave).then((oculto) => {
          if (!oculto) {
            setVideoPromo({ videoUrl: data.videoUrl, clave });
            setModalVideoPromo(true);
          }
        });
      }
    });

    const qEnc = query(collection(db, 'encuestas'), where('activa', '==', true));
    const unsubEnc = onSnapshot(qEnc, (snapshot) => {
      if (!snapshot.empty) {
        const enc = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
        const yaVotoEnNube = uid && enc.votos && enc.votos[uid];
        if (yaVotoEnNube) return;

        AsyncStorage.getItem(`encuesta_no_mostrar_${enc.id}`).then((oculto) => {
          if (!oculto) {
            setEncuesta(enc);
            setOpcionEncuestaSel(null);
            setModalEncuesta(true);
          }
        });
      }
    });

    return () => {
      unsubVideo();
      unsubEnc();
    };
  }, [uid]);

  const enviarVotoEncuesta = async () => {
    if (!encuesta || !opcionEncuestaSel) {
      Alert.alert('Elige una opción', 'Selecciona una alternativa antes de enviar.');
      return;
    }
    try {
      if (uid) {
        await updateDoc(doc(db, 'encuestas', encuesta.id), {
          [`votos.${uid}`]: opcionEncuestaSel,
        });
      }
      await AsyncStorage.setItem(`encuesta_no_mostrar_${encuesta.id}`, 'true');
      setModalEncuesta(false);
      reproducir('exito');
      Alert.alert('¡Gracias por opinar!', 'Tu voto ayuda a mejorar TamboRuta.');
    } catch {
      setModalEncuesta(false);
    }
  };

  const enviarSoporte = async () => {
    if (!mensajeSupervisor.trim()) {
      Alert.alert('Escribe tu consulta', 'Detalla en qué podemos ayudarte antes de enviar.');
      return;
    }
    await addDoc(collection(db, 'soporte_supervisor'), {
      uid: uid || '',
      nombre: perfil?.nombre || storeUser?.nombre || 'Usuario',
      mensaje: mensajeSupervisor.trim(),
      fecha: serverTimestamp(),
      atendido: false,
    });
    setMensajeSupervisor('');
    setModalAyuda(false);
    Alert.alert('Enviado al Supervisor', 'Hemos recibido tu consulta y te responderemos pronto.');
  };

  const distanciaKm =
    origen && destinoCoord
      ? calcularDistanciaHaversine(
          origen.latitude,
          origen.longitude,
          destinoCoord.latitude,
          destinoCoord.longitude
        )
      : null;

  const detectarUbicacion = async (silencioso = false) => {
    if (ubicando) return;
    setUbicando(true);
    try {
      if (Platform.OS === 'web') {
        if (!navigator.geolocation) {
          setUbicando(false);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coord = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setOrigen(coord);
            setRegionActual({
              latitude: coord.latitude,
              longitude: coord.longitude,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015,
            });
            setOrigenTexto(perfil?.caserio || 'Ubicación GPS activa');
            setUbicando(false);
          },
          () => setUbicando(false),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!silencioso) {
            Alert.alert(
              'Permiso GPS',
              'Activa la ubicación de tu celular para enviar tus coordenadas al chofer.'
            );
          }
          setUbicando(false);
          return;
        }
        let loc = await Location.getLastKnownPositionAsync({});
        if (!loc) {
          loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        }
        if (loc) {
          const coord = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setOrigen(coord);
          setRegionActual({
            latitude: coord.latitude,
            longitude: coord.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          });
          setOrigenTexto(perfil?.caserio || 'Ubicación GPS activa');
        } else if (!silencioso) {
          Alert.alert('GPS débil', 'No se pudo leer el satélite aún. Intenta de nuevo.');
        }
        setUbicando(false);
      }
    } catch {
      setUbicando(false);
    }
  };

  const abrirModalNuevaRuta = () => {
    setModalNuevo(true);
    detectarUbicacion(true);
  };

  const seleccionarDestinoFrecuente = (item: (typeof DESTINOS_FRECUENTES)[number]) => {
    const coord = { latitude: item.lat, longitude: item.lng };
    setDestino(item.nombre);
    setDestinoCoord(coord);
    setRegionActual({
      latitude: item.lat,
      longitude: item.lng,
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    });
    const base = item.tarifa;
    const extraMandado = esMandado ? 2 : 0;
    const extraSolo = modalidadViaje === 'solo' ? 2 : 0;
    setPrecio(String(base + extraMandado + extraSolo));
  };

  const toggleModoMandado = () => {
    const nuevo = !esMandado;
    setEsMandado(nuevo);
    const actual = Number(precio) || 6;
    setPrecio(String(nuevo ? actual + 2 : Math.max(2, actual - 2)));
  };

  const cambiarModalidadViaje = (nuevaMod: 'compartido' | 'solo') => {
    if (nuevaMod === modalidadViaje) return;
    setModalidadViaje(nuevaMod);
    const actual = Number(precio) || 6;
    setPrecio(String(nuevaMod === 'solo' ? actual + 2 : Math.max(2, actual - 2)));
  };

  const ajustarPrecio = (delta: number) => {
    const actual = Number(precio) || 3;
    setPrecio(String(Math.max(2, actual + delta)));
  };

  useEffect(() => {
    const q = query(collection(db, 'solicitudes'), where('estado', '==', 'abierta'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista: Solicitud[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          lista.push({ id: d.id, ...data });
        });
        lista.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setSolicitudesRaw(lista);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const solicitudes = solicitudesRaw.filter((item) => {
    if (!esChofer) return true;
    if (retrasoSegundosChofer === 0) return true;
    const s = item as any;
    const creadoMs = s.creadoTimestamp
      ? Number(s.creadoTimestamp)
      : s.createdAt?.seconds
        ? s.createdAt.seconds * 1000
        : 0;
    if (!creadoMs) return true;
    const segundosTranscurridos = (ahoraTick - creadoMs) / 1000;
    return segundosTranscurridos >= retrasoSegundosChofer;
  });

  useEffect(() => {
    if (esChofer && !membresiaVencida && solicitudes.length > prevVisibleCountRef.current) {
      reproducir('solicitud');
      scheduleNotification('Nueva Solicitud', 'Un pasajero solicita ruta hacia Tambogrande/Anexos.');
    }
    prevVisibleCountRef.current = solicitudes.length;
  }, [solicitudes.length, esChofer, membresiaVencida, reproducir]);

  useEffect(() => {
    if (!modalOfertas) {
      setOfertas([]);
      return;
    }
    const q = query(
      collection(db, 'contraofertas'),
      where('solicitudId', '==', modalOfertas.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const lista: ContraOferta[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        lista.push({ id: d.id, ...data });
      });
      lista.sort((a, b) => {
        const diffRango = getPesoPlanChofer(b.choferPlan) - getPesoPlanChofer(a.choferPlan);
        if (diffRango !== 0) return diffRango;
        return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
      });
      setOfertas(lista);
      if (lista.length > 0) {
        reproducir('oferta');
        scheduleNotification('Nueva Oferta', 'Un chofer respondió a tu solicitud.');
      }
    });
    return unsub;
  }, [modalOfertas, reproducir]);

  useEffect(() => {
    if (!uid) return;
    const campoUid = esChofer ? 'choferUid' : 'clienteUid';
    const q = query(
      collection(db, 'chats'),
      where(campoUid, '==', uid),
      where('estado', '==', 'en_curso')
    );

    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        setViajeActivo(null);
        setMensajesSinLeer(0);
        return;
      }
      const chatDoc = snap.docs[0];
      const data = chatDoc.data() as any;

      setViajeActivo({
        id: chatDoc.id,
        contraparte: esChofer
          ? data.clienteNombre || 'Pasajero'
          : data.choferNombre || 'Chofer',
        precio: data.precioAcordado ?? data.precio ?? 0,
      });

      const claveAuto = `chat_auto_abierto_${chatDoc.id}`;
      const yaAbierto = await AsyncStorage.getItem(claveAuto);
      if (!yaAbierto) {
        await AsyncStorage.setItem(claveAuto, '1');
        scheduleNotification('Viaje Aceptado', '¡Tu ruta está en curso!');
        router.push(`/viaje/${chatDoc.id}` as any);
      }
    });

    return () => unsub();
  }, [esChofer, uid, router]);

  useEffect(() => {
    if (!viajeActivo?.id || !uid) return;
    const q = query(
      collection(db, 'chats', viajeActivo.id, 'mensajes'),
      where('leido', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      let sinLeer = 0;
      snap.forEach((docMsg) => {
        const m = docMsg.data() as any;
        if (m.senderUid && m.senderUid !== uid) sinLeer++;
      });
      setMensajesSinLeer(sinLeer);
    });
    return () => unsub();
  }, [viajeActivo?.id, uid]);

  const manejarMarcarDestinoEnPantallaCompleta = async (coord: Coordenada) => {
    setDestinoCoord(coord);
    setBuscandoNombreLugar(true);
    setDestino('Buscando nombre del lugar...');
    const nombreReal = await obtenerNombreLugar(coord.latitude, coord.longitude);
    setDestino(nombreReal);
    setBuscandoNombreLugar(false);
  };

  const crearSolicitud = () => {
    if (!uid) {
      Alert.alert('Sesión expirada', 'Por favor cierra la app y vuelve a entrar.');
      return;
    }

    if (perfil?.bloqueadoHasta && perfil.bloqueadoHasta > Date.now()) {
      Alert.alert('Cuenta bloqueada', 'Tienes una suspensión por cancelaciones reiteradas.');
      return;
    }
    if (!destino.trim() || destino === 'Buscando nombre del lugar...' || !precio) {
      Alert.alert('Faltan datos', 'Escribe a dónde vas o márcalo en el mapa.');
      return;
    }

    const origenFinal = origen || {
      latitude: ZONA_DEFAULT.latitude,
      longitude: ZONA_DEFAULT.longitude,
    };
    const destinoFinal = destinoCoord || null;

    setModalNuevo(false);
    setOrigenTexto('');
    setDestino('');
    setReferencia('');
    setPrecio('6');
    setEsMandado(false);
    setModalidadViaje('compartido');
    setCantidadPasajeros(1);
    setOrigen(null);
    setDestinoCoord(null);

    addDoc(collection(db, 'solicitudes'), {
      clienteUid: uid,
      clienteNombre: perfil?.nombre || storeUser?.nombre || 'Pasajero',
      caserio: origenTexto.trim() || perfil?.caserio || storeUser?.caserio || 'CP3',
      origen: origenFinal,
      origenCoords: { latitude: origenFinal.latitude, longitude: origenFinal.longitude },
      origenLat: origenFinal.latitude,
      origenLng: origenFinal.longitude,
      destino: destino.trim(),
      destinoCoords: destinoFinal
        ? { latitude: destinoFinal.latitude, longitude: destinoFinal.longitude }
        : null,
      destinoLat: destinoFinal?.latitude ?? null,
      destinoLng: destinoFinal?.longitude ?? null,
      referencia: referencia.trim(),
      esMandado,
      modalidad: esMandado ? 'mandado' : modalidadViaje,
      cupos: esMandado ? 1 : cantidadPasajeros,
      precio: Number(precio),
      precioOferta: Number(precio),
      estado: 'abierta',
      creadoTimestamp: Date.now(),
      createdAt: serverTimestamp(),
    }).catch(() => {
      Alert.alert('Aviso', 'Tu solicitud se enviará en cuanto tengas conexión.');
    });
  };

  const eliminarSolicitud = async (solId: string) => {
    Alert.alert('Cancelar solicitud', '¿Deseas cancelar esta búsqueda? Quedará en auditoría.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: () => {
          updateDoc(doc(db, 'solicitudes', solId), {
            estado: 'cancelada',
            canceladoPor: uid || 'cliente',
            fechaCancelacion: serverTimestamp(),
          }).catch(() => {});
        },
      },
    ]);
  };

  const enviarContraofertaChofer = () => {
    if (!uid || !modalContraofertar) return;
    if (cuentaEnRevision) {
      Alert.alert('Cuenta en revisión', 'Estamos verificando tu documentación.');
      return;
    }
    if (membresiaVencida) {
      Alert.alert('Cuenta pausada', 'Renueva tu plan para enviar contraofertas.');
      return;
    }
    const monto = Number(precioContraoferta);
    if (!monto || monto < 2) {
      Alert.alert('Monto inválido', 'Ingresa una tarifa válida en soles.');
      return;
    }

    const solTempId = modalContraofertar.id;
    setModalContraofertar(null);
    setPrecioContraoferta('');

    addDoc(collection(db, 'contraofertas'), {
      solicitudId: solTempId,
      choferUid: uid,
      choferNombre: perfil?.nombre || storeUser?.nombre || 'Chofer',
      choferPlan: planChofer,
      precio: monto,
      calificacion: Number(perfil?.calificacion || 5.0),
      createdAt: serverTimestamp(),
    })
      .then(() => {
        Alert.alert('Oferta enviada', 'El pasajero recibió tu propuesta.');
      })
      .catch(() => {
        Alert.alert('Aviso', 'La oferta se enviará cuando recuperes conexión.');
      });
  };

  const aceptarSolicitudDirecto = async (sol: Solicitud) => {
    if (!uid || aceptandoId) return;
    if (cuentaEnRevision) {
      Alert.alert('Cuenta en revisión', 'Estamos verificando tu documentación.');
      return;
    }
    if (membresiaVencida) {
      Alert.alert('Cuenta pausada', 'Renueva tu plan para aceptar carreras.');
      return;
    }

    setAceptandoId(sol.id);
    const s = sol as any;
    const nombreChofer = perfil?.nombre || storeUser?.nombre || 'Chofer';
    const placaChofer = perfil?.placa || 'Verificada';
    const montoFinal = s.precioOferta ?? s.precio ?? 0;
    const pinSeguridad = String(Math.floor(1000 + Math.random() * 9000));

    try {
      const chatId = await Promise.race([
        runTransaction(db, async (tx) => {
          const solRef = doc(db, 'solicitudes', sol.id);
          const solSnap = await tx.get(solRef);
          if (!solSnap.exists()) throw new Error('La solicitud ya no existe.');
          if (solSnap.data().estado !== 'abierta')
            throw new Error('Otro chofer ya tomó esta carrera.');

          tx.update(solRef, {
            estado: 'aceptada',
            choferUid: uid,
            choferNombre: nombreChofer,
            precioAcordado: montoFinal,
            pinSeguridad,
          });

          const chatRef = doc(collection(db, 'chats'));
          tx.set(chatRef, {
            solicitudId: sol.id,
            clienteUid: sol.clienteUid,
            choferUid: uid,
            clienteNombre: sol.clienteNombre,
            choferNombre: nombreChofer,
            choferPlaca: placaChofer,
            choferModelo: perfil?.vehiculoModelo || 'Mototaxi',
            choferColor: perfil?.vehiculoColor || '',
            origen: sol.caserio || 'Origen',
            destino: sol.destino,
            referencia: s.referencia || '',
            precio: montoFinal,
            precioAcordado: montoFinal,
            pinSeguridad,
            clienteRecogido: false,
            estado: 'en_curso',
            createdAt: serverTimestamp(),
            origenLat: s.origenLat ?? s.origenCoords?.latitude ?? null,
            origenLng: s.origenLng ?? s.origenCoords?.longitude ?? null,
            destinoLat: s.destinoLat ?? s.destinoCoords?.latitude ?? null,
            destinoLng: s.destinoLng ?? s.destinoCoords?.longitude ?? null,
          });

          const msgRef = doc(collection(chatRef, 'mensajes'));
          tx.set(msgRef, {
            tipo: 'sistema',
            texto: `🛡️ Carrera comprometida con ${nombreChofer} • Placa ${placaChofer}. Solo esta unidad puede realizar el servicio.`,
            createdAt: serverTimestamp(),
          });

          return chatRef.id;
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        ),
      ]);

      await AsyncStorage.setItem(`chat_auto_abierto_${chatId}`, '1');

      await AsyncStorage.setItem(
        `viaje_offline_${chatId}`,
        JSON.stringify({
          chatId,
          pinSeguridad,
          destino: sol.destino,
          precioAcordado: montoFinal,
          clienteNombre: sol.clienteNombre,
          choferNombre: nombreChofer,
        })
      );

      router.push(`/viaje/${chatId}` as any);
    } catch (e: any) {
      Alert.alert('Aviso', e?.message ?? 'No se pudo procesar.');
    } finally {
      setAceptandoId(null);
    }
  };

  const aceptarOferta = async (oferta: ContraOferta, sol: Solicitud) => {
    if (!uid || timeoutActivo) return;
    setTimeoutActivo(true);
    const s = sol as any;
    const pinSeguridad = String(Math.floor(1000 + Math.random() * 9000));

    try {
      const resultado = await Promise.race([
        runTransaction(db, async (tx) => {
          const solRef = doc(db, 'solicitudes', sol.id);
          const solSnap = await tx.get(solRef);
          if (!solSnap.exists()) throw new Error('La solicitud ya no existe.');
          if (solSnap.data().estado !== 'abierta')
            throw new Error('La solicitud ya fue aceptada.');

          tx.update(solRef, {
            estado: 'aceptada',
            choferUid: oferta.choferUid,
            choferNombre: oferta.choferNombre,
            precioAcordado: oferta.precio,
            pinSeguridad,
          });

          const chatRef = doc(collection(db, 'chats'));
          tx.set(chatRef, {
            solicitudId: sol.id,
            clienteUid: sol.clienteUid,
            choferUid: oferta.choferUid,
            clienteNombre: sol.clienteNombre,
            choferNombre: oferta.choferNombre,
            origen: sol.caserio || 'Origen',
            destino: sol.destino,
            referencia: s.referencia || '',
            precio: oferta.precio,
            precioAcordado: oferta.precio,
            pinSeguridad,
            clienteRecogido: false,
            estado: 'en_curso',
            createdAt: serverTimestamp(),
            origenLat: s.origenLat ?? s.origenCoords?.latitude ?? null,
            origenLng: s.origenLng ?? s.origenCoords?.longitude ?? null,
            destinoLat: s.destinoLat ?? s.destinoCoords?.latitude ?? null,
            destinoLng: s.destinoLng ?? s.destinoCoords?.longitude ?? null,
          });

          const msgRef = doc(collection(chatRef, 'mensajes'));
          tx.set(msgRef, {
            tipo: 'sistema',
            texto: `🛡️ Carrera comprometida con ${oferta.choferNombre}. Solo esta unidad puede realizar el servicio.`,
            createdAt: serverTimestamp(),
          });

          return chatRef.id;
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        ),
      ]);

      await AsyncStorage.setItem(`chat_auto_abierto_${resultado}`, '1');

      await AsyncStorage.setItem(
        `viaje_offline_${resultado}`,
        JSON.stringify({
          chatId: resultado,
          pinSeguridad,
          destino: sol.destino,
          precioAcordado: oferta.precio,
          clienteNombre: sol.clienteNombre,
          choferNombre: oferta.choferNombre,
        })
      );

      setModalOfertas(null);
      router.push(`/viaje/${resultado}` as any);
    } catch (e: any) {
      Alert.alert('Aviso', e?.message ?? 'No se pudo procesar.');
    } finally {
      setTimeoutActivo(false);
    }
  };

  const solicitudesFiltradas = solicitudes.filter((item) => {
    const s = item as any;
    if (filtroLista === 'compartidos') return s.modalidad === 'compartido';
    if (filtroLista === 'mandados') return Boolean(s.esMandado);
    if (filtroLista === 'mias') return item.clienteUid === uid;
    return true;
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 54,
          paddingBottom: 10,
        }}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#111827' }}>TamboRuta</Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>
            {esClienteOtienda
              ? 'CP3 · CP2 · Hualtaco · CP11 · CP12 · Tambogrande'
              : esChofer
                ? `${solicitudes.length} solicitudes visibles (${planChofer.toUpperCase()})`
                : 'Zona activa'}
          </Text>
        </View>

        <Pressable onPress={() => setModalAyuda(true)} style={styles.btnGuiaHeader}>
          <HelpCircle color="#059669" size={17} />
          <Text style={{ fontWeight: '800', color: '#065f46', fontSize: 12 }}>Guía</Text>
        </Pressable>
      </View>

      {/* Cinta rápida de Ofertas Flash para Pasajeros */}
      {esClienteOtienda && ofertasFlashHome.length > 0 && (
        <Pressable
          onPress={() => router.push('/(tabs)/tienda' as any)}
          style={styles.flashHomeBanner}
        >
          <Zap color="#111827" size={16} fill="#111827" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#111827', flex: 1 }} numberOfLines={1}>
            ⚡ {ofertasFlashHome.length} Oferta(s) Flash hoy: {ofertasFlashHome[0].nombre} — Ver en Tienda
          </Text>
        </Pressable>
      )}

      {esChofer && (
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 10,
            backgroundColor: '#fff',
            borderRadius: 14,
            padding: 10,
            borderWidth: 1,
            borderColor: '#d1fae5',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#065f46' }}>
              Meta diaria: S/ {gananciaHoy.toFixed(2)} / S/ {metaDiaria.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>
              {progresoMeta}%
            </Text>
          </View>
          <View style={{ height: 7, backgroundColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
            <View
              style={{
                width: `${progresoMeta}%`,
                height: '100%',
                backgroundColor: '#059669',
              }}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: '#f3f4f6',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>
              👥 Asientos libres en moto:
            </Text>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {[0, 1, 2].map((num) => (
                <Pressable
                  key={num}
                  onPress={() => actualizarCuposChofer(num)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                    backgroundColor: cuposLibresChofer === num ? '#059669' : '#f3f4f6',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: cuposLibresChofer === num ? '#fff' : '#374151',
                    }}
                  >
                    {num === 0 ? 'Lleno' : `${num} cupo${num > 1 ? 's' : ''}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      {mostrarMapaRadar && (
        <View
          style={{
            marginHorizontal: 20,
            height: 150,
            borderRadius: 20,
            overflow: 'hidden',
            backgroundColor: '#e5e7eb',
            marginBottom: 10,
            borderWidth: 1,
            borderColor: '#e5e7eb',
          }}
        >
          <MapaZona
            latitude={-5.0561}
            longitude={-80.3472}
            label={`Zona ${perfil?.caserio ?? storeUser?.caserio ?? 'CP3 - Tambogrande'}`}
            motos={motosEnLinea}
          />
        </View>
      )}

      {esChofer && membresiaVencida && (
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 12,
            backgroundColor: '#fef2f2',
            borderWidth: 1,
            borderColor: '#f87171',
            borderRadius: 14,
            padding: 12,
          }}
        >
          <Text style={{ color: '#b91c1c', fontWeight: '800', fontSize: 15, marginBottom: 4 }}>
            Cuenta Pausada (Avance guardado)
          </Text>
          <Text style={{ color: '#7f1d1d', fontSize: 13, marginBottom: 10 }}>
            Tus estrellas e historial siguen guardados. Renueva 30 días desde {montoRenovacion} en
            Perfil para seguir trabajando.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/perfil' as any)}
            style={{
              backgroundColor: '#dc2626',
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
              Ir a Perfil para renovar
            </Text>
          </Pressable>
        </View>
      )}

      {esClienteOtienda && (
        <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
          <Pressable
            onPress={abrirModalNuevaRuta}
            style={{
              backgroundColor: '#059669',
              paddingVertical: 14,
              borderRadius: 14,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              elevation: 2,
            }}
          >
            <Gavel color="#fff" size={19} />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
              Nueva solicitud de ruta
            </Text>
          </Pressable>
        </View>
      )}

      {/* Barra de filtros + ocultar mapa */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          marginBottom: 8,
          gap: 6,
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            onPress={() => setFiltroLista('todas')}
            style={[styles.filterChip, filtroLista === 'todas' && styles.filterChipActivo]}
          >
            <Text style={[styles.filterText, filtroLista === 'todas' && styles.filterTextActivo]}>
              Todas ({solicitudes.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFiltroLista('compartidos')}
            style={[styles.filterChip, filtroLista === 'compartidos' && styles.filterChipActivo]}
          >
            <Text
              style={[styles.filterText, filtroLista === 'compartidos' && styles.filterTextActivo]}
            >
              👥 Colectivo
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFiltroLista('mandados')}
            style={[styles.filterChip, filtroLista === 'mandados' && styles.filterChipActivo]}
          >
            <Text style={[styles.filterText, filtroLista === 'mandados' && styles.filterTextActivo]}>
              📦 Mandados
            </Text>
          </Pressable>
          {!esChofer && (
            <Pressable
              onPress={() => setFiltroLista('mias')}
              style={[styles.filterChip, filtroLista === 'mias' && styles.filterChipActivo]}
            >
              <Text style={[styles.filterText, filtroLista === 'mias' && styles.filterTextActivo]}>
                Mis rutas
              </Text>
            </Pressable>
          )}
        </ScrollView>

        <Pressable
          onPress={() => setMostrarMapaRadar(!mostrarMapaRadar)}
          style={styles.toggleMapBtn}
        >
          {mostrarMapaRadar ? (
            <EyeOff color="#374151" size={14} />
          ) : (
            <Eye color="#059669" size={14} />
          )}
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>
            {mostrarMapaRadar ? 'Ocultar' : 'Mapa'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={solicitudesFiltradas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {}} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#059669" style={{ marginTop: 30 }} />
          ) : (
            <View style={{ alignItems: 'center', marginTop: 30 }}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>
                No hay solicitudes abiertas ahora.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const s = item as any;
          const monto = s.precio ?? s.precioOferta ?? 0;
          const esCompartido = s.modalidad === 'compartido';
          const numCupos = Number(s.cupos || 1);

          return (
            <View style={styles.compactCard}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={styles.carBadge}>
                    <Car color="#059669" size={16} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontWeight: '800', color: '#111827', fontSize: 14 }}
                      numberOfLines={1}
                    >
                      {item.clienteNombre} {s.esMandado ? '· 📦 Mandado' : ''}
                    </Text>
                    <Text
                      style={{ color: '#059669', fontSize: 12, fontWeight: '700' }}
                      numberOfLines={1}
                    >
                      {item.caserio} → {item.destino}
                    </Text>
                    {!s.esMandado && (
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: esCompartido ? '#0369a1' : '#92400e',
                          marginTop: 2,
                        }}
                      >
                        {esCompartido
                          ? `👥 Cupo compartido (${numCupos} asiento${numCupos > 1 ? 's' : ''})`
                          : `🛵 Carrera Expresa (${numCupos} pasajero${numCupos > 1 ? 's' : ''})`}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#059669' }}>
                    S/ {monto}
                  </Text>
                  {item.clienteUid === uid && (
                    <Pressable
                      onPress={() => eliminarSolicitud(item.id)}
                      style={{ backgroundColor: '#fee2e2', padding: 5, borderRadius: 8 }}
                    >
                      <Trash2 color="#ef4444" size={15} />
                    </Pressable>
                  )}
                </View>
              </View>

              {esChofer ? (
                <View style={{ marginTop: 8 }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}
                  >
                    <Lock color="#6b7280" size={12} />
                    <Text style={{ color: '#6b7280', fontSize: 11 }}>
                      Ubicación GPS exacta y referencia se muestran al aceptar.
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => aceptarSolicitudDirecto(item)}
                      disabled={aceptandoId === item.id}
                      style={{
                        flex: 2,
                        backgroundColor: aceptandoId === item.id ? '#a7f3d0' : '#059669',
                        paddingVertical: 10,
                        borderRadius: 11,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                        {aceptandoId === item.id ? 'Aceptando...' : `Aceptar (S/ ${monto})`}
                      </Text>
                    </Pressable>
                    {!membresiaVencida && (
                      <Pressable
                        onPress={() => {
                          setModalContraofertar(item);
                          setPrecioContraoferta(String(monto + 1));
                        }}
                        style={{
                          flex: 1,
                          backgroundColor: '#f3f4f6',
                          paddingVertical: 10,
                          borderRadius: 11,
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: '#e5e7eb',
                        }}
                      >
                        <Text style={{ color: '#374151', fontWeight: '700', fontSize: 13 }}>
                          Ofertar
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : esClienteOtienda && item.clienteUid === uid ? (
                <Pressable
                  onPress={() => setModalOfertas(item)}
                  style={{
                    backgroundColor: '#059669',
                    paddingVertical: 9,
                    borderRadius: 10,
                    alignItems: 'center',
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                    Ver contraofertas
                  </Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <Tag color="#9ca3af" size={13} />
                  <Text style={{ color: '#9ca3af', fontSize: 12 }}>Esperando choferes...</Text>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Burbuja flotante estilo Messenger cuando hay un viaje activo */}
      {viajeActivo && (
        <Pressable
          onPress={() => router.push(`/viaje/${viajeActivo.id}` as any)}
          style={styles.burbujaFlotante}
        >
          <View style={styles.burbujaIconoWrap}>
            <MessageCircle color="#fff" size={22} />
            {mensajesSinLeer > 0 && (
              <View style={styles.burbujaBadge}>
                <Text style={styles.burbujaBadgeText}>{mensajesSinLeer}</Text>
              </View>
            )}
          </View>
          <View style={{ maxWidth: 175 }}>
            <Text style={styles.burbujaTitulo} numberOfLines={1}>
              🛵 Viaje activo · S/ {viajeActivo.precio}
            </Text>
            <Text style={styles.burbujaSubtitulo} numberOfLines={1}>
              {mensajesSinLeer > 0
                ? `¡${mensajesSinLeer} mensaje(s) nuevo(s)!`
                : `Chat con ${viajeActivo.contraparte}`}
            </Text>
          </View>
        </Pressable>
      )}

      {/* Modal Nueva Solicitud */}
      <Modal
        visible={modalNuevo}
        transparent
        animationType="slide"
        onRequestClose={() => setModalNuevo(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 20,
              paddingBottom: 32,
              maxHeight: '94%',
              flex: 1,
            }}
          >
            <ScrollView
              contentContainerStyle={{ paddingBottom: 90 }}
              keyboardShouldPersistTaps="always"
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>
                  Pedir mototaxi
                </Text>
                <Pressable onPress={() => setModalNuevo(false)}>
                  <X color="#6b7280" size={24} />
                </Pressable>
              </View>

              <View
                style={{
                  backgroundColor: '#ecfdf5',
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#a7f3d0',
                  marginBottom: 14,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#065f46', marginBottom: 8 }}>
                  1. ¿Dónde estás? (Punto de recojo)
                </Text>

                <Pressable
                  onPress={() => detectarUbicacion(false)}
                  disabled={ubicando}
                  style={{
                    backgroundColor: origen ? '#059669' : '#111827',
                    paddingVertical: 13,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  {ubicando ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <MapPin color="#fff" size={18} />
                  )}
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    {ubicando
                      ? 'Detectando tu GPS...'
                      : origen
                        ? '✓ GPS enviado (Tocar para actualizar)'
                        : 'Enviar mi ubicación actual (GPS)'}
                  </Text>
                </Pressable>

                <TextInput
                  value={origenTexto}
                  onChangeText={setOrigenTexto}
                  placeholder="Tu sector o caserío (Ej: San Martín CP3)"
                  style={[styles.input, { backgroundColor: '#fff' }]}
                />
                <TextInput
                  value={referencia}
                  onChangeText={setReferencia}
                  placeholder="Referencia exacta (Ej: Frente al colegio / portón azul)"
                  style={[styles.input, { backgroundColor: '#fff', marginTop: 6 }]}
                />
              </View>

              <View
                style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 8 }}>
                  2. ¿A dónde vas?
                </Text>

                <TextInput
                  value={destino}
                  onChangeText={setDestino}
                  placeholder="Escribe el lugar, calle o referencia..."
                  style={[styles.input, { backgroundColor: '#fff', marginBottom: 8 }]}
                />

                <Pressable
                  onPress={() => setModalMapaDestino(true)}
                  style={{
                    backgroundColor: destinoCoord ? '#dcfce7' : '#e0f2fe',
                    paddingVertical: 13,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderWidth: 1,
                    borderColor: destinoCoord ? '#86efac' : '#bae6fd',
                    marginBottom: 10,
                  }}
                >
                  <Navigation color={destinoCoord ? '#15803d' : '#0369a1'} size={18} />
                  <Text
                    style={{
                      color: destinoCoord ? '#15803d' : '#0369a1',
                      fontWeight: '800',
                      fontSize: 14,
                    }}
                  >
                    {destinoCoord
                      ? '✓ Ruta trazada en mapa (Ver o cambiar)'
                      : '🗺️ Marcar destino y ver ruta en mapa'}
                  </Text>
                </Pressable>

                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 6 }}>
                  Rutas frecuentes (CP3 - Tambogrande y Anexos):
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                >
                  {DESTINOS_FRECUENTES.map((item) => {
                    const activo = destino === item.nombre;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => seleccionarDestinoFrecuente(item)}
                        style={{
                          backgroundColor: activo ? '#059669' : '#fff',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 12,
                          marginRight: 8,
                          borderWidth: 1,
                          borderColor: activo ? '#059669' : '#d1d5db',
                        }}
                      >
                        <Text
                          style={{
                            color: activo ? '#fff' : '#111827',
                            fontWeight: '700',
                            fontSize: 12,
                          }}
                        >
                          {item.nombre} · S/ {item.tarifa}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {distanciaKm !== null && (
                  <Text
                    style={{ color: '#059669', fontWeight: '700', fontSize: 12, marginTop: 8 }}
                  >
                    Distancia estimada: {formatearDistancia(distanciaKm)}
                  </Text>
                )}
              </View>

              {!esMandado && (
                <View
                  style={{
                    backgroundColor: '#f9fafb',
                    borderRadius: 14,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#e5e7eb',
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Users color="#059669" size={16} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827' }}>
                      Modalidad del viaje y asientos
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => cambiarModalidadViaje('compartido')}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: modalidadViaje === 'compartido' ? '#059669' : '#fff',
                        borderWidth: 1,
                        borderColor: modalidadViaje === 'compartido' ? '#059669' : '#d1d5db',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: modalidadViaje === 'compartido' ? '#fff' : '#374151',
                        }}
                      >
                        👥 Cupo Compartido
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: modalidadViaje === 'compartido' ? '#d1fae5' : '#6b7280',
                        }}
                      >
                        Tarifa económica en ruta
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => cambiarModalidadViaje('solo')}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: modalidadViaje === 'solo' ? '#111827' : '#fff',
                        borderWidth: 1,
                        borderColor: modalidadViaje === 'solo' ? '#111827' : '#d1d5db',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: modalidadViaje === 'solo' ? '#fff' : '#374151',
                        }}
                      >
                        🛵 Expreso (Solo)
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: modalidadViaje === 'solo' ? '#d1d5db' : '#6b7280',
                        }}
                      >
                        Directo sin esperar (+S/2)
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>
                      ¿Cuántos viajan?
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {([1, 2, 3] as const).map((n) => (
                        <Pressable
                          key={n}
                          onPress={() => setCantidadPasajeros(n)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: cantidadPasajeros === n ? '#059669' : '#fff',
                            borderWidth: 1,
                            borderColor: cantidadPasajeros === n ? '#059669' : '#d1d5db',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '800',
                              color: cantidadPasajeros === n ? '#fff' : '#111827',
                            }}
                          >
                            {n} {n === 1 ? 'persona' : 'personas'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              <Pressable
                onPress={toggleModoMandado}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: esMandado ? '#ecfdf5' : '#f9fafb',
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: esMandado ? '#059669' : '#e5e7eb',
                  marginBottom: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: '#111827', fontSize: 13 }}>
                    📦 Modo Mandado / Encargo (+ S/ 2.00)
                  </Text>
                  <Text style={{ color: '#6b7280', fontSize: 11 }}>
                    Traer compras o paquetes sin que viajes
                  </Text>
                </View>
                <Text style={{ fontWeight: '800', color: esMandado ? '#059669' : '#9ca3af' }}>
                  {esMandado ? 'SÍ' : 'NO'}
                </Text>
              </Pressable>

              <View>
                <Text style={styles.label}>3. Tu oferta de precio (S/)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    onPress={() => ajustarPrecio(-1)}
                    style={{
                      backgroundColor: '#f3f4f6',
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#e5e7eb',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>-1</Text>
                  </Pressable>
                  <TextInput
                    value={precio}
                    onChangeText={setPrecio}
                    placeholder="Ej: 6"
                    keyboardType="numeric"
                    style={[styles.input, { flex: 1, textAlign: 'center', fontWeight: '800' }]}
                  />
                  <Pressable
                    onPress={() => ajustarPrecio(1)}
                    style={{
                      backgroundColor: '#f3f4f6',
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#e5e7eb',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>+1</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={crearSolicitud}
                style={{
                  backgroundColor: '#059669',
                  paddingVertical: 16,
                  borderRadius: 16,
                  alignItems: 'center',
                  marginTop: 14,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  Publicar solicitud (S/ {precio || 0})
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Pantalla Completa para Elegir Destino y Ver Ruta en Carretera */}
      <Modal
        visible={modalMapaDestino}
        animationType="slide"
        onRequestClose={() => setModalMapaDestino(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#111827' }}>
          <View
            style={{
              backgroundColor: '#fff',
              paddingTop: 48,
              paddingBottom: 12,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: '#e5e7eb',
            }}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }} numberOfLines={1}>
                {destino ? destino : 'Toca en el mapa a dónde vas'}
              </Text>
              <Text style={{ fontSize: 12, color: '#059669', fontWeight: '700' }}>
                {buscandoNombreLugar
                  ? 'Identificando nombre del lugar...'
                  : destinoCoord
                    ? `Ruta por carretera lista ✓ ${distanciaKm ? `(${formatearDistancia(distanciaKm)})` : ''}`
                    : 'Toca un punto para ver el camino'}
              </Text>
            </View>
            <Pressable
              onPress={() => setModalMapaDestino(false)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#f3f4f6',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <X color="#111827" size={20} />
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            <MapaSelector
              region={regionActual}
              origen={origen}
              destino={destinoCoord}
              onMapPress={manejarMarcarDestinoEnPantallaCompleta}
              onPressMiUbicacion={() => detectarUbicacion(false)}
              ubicando={ubicando}
            />
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              padding: 14,
              paddingBottom: 26,
              borderTopWidth: 1,
              borderTopColor: '#e5e7eb',
              gap: 8,
            }}
          >
            <TextInput
              value={destino}
              onChangeText={setDestino}
              placeholder="Escribe referencia del destino (Ej: Plaza de Tambogrande)"
              style={[styles.input, { paddingVertical: 10, fontSize: 14 }]}
            />
            <Pressable
              onPress={() => setModalMapaDestino(false)}
              style={{
                backgroundColor: '#059669',
                paddingVertical: 14,
                borderRadius: 14,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 color="#fff" size={20} />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                Confirmar este destino
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal Enviar Contraoferta (Chofer) */}
      <Modal
        visible={!!modalContraofertar}
        transparent
        animationType="fade"
        onRequestClose={() => setModalContraofertar(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 24,
              padding: 24,
              width: '100%',
              maxWidth: 340,
            }}
          >
            <Text style={{ fontSize: 19, fontWeight: '800', color: '#111827', marginBottom: 4 }}>
              Enviar contraoferta
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              Hacia: {modalContraofertar?.destino}
            </Text>
            <TextInput
              value={precioContraoferta}
              onChangeText={setPrecioContraoferta}
              placeholder="Ej: 8"
              keyboardType="numeric"
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setModalContraofertar(null)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  backgroundColor: '#f3f4f6',
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '700', color: '#6b7280' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={enviarContraofertaChofer}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  backgroundColor: '#059669',
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>Enviar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Bienvenida Renovado */}
      <Modal visible={modalBienvenida} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.55)',
            padding: 20,
          }}
        >
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 4 }}>
              ¡Bienvenido a TamboRuta!
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              Todo el transporte y comercio de CP3 y Tambogrande en un solo lugar:
            </Text>

            <View style={styles.guiaCardItem}>
              <Text style={styles.guiaCardTitle}>🛵 Rutas y Colectivos</Text>
              <Text style={styles.guiaCardDesc}>
                Pide tu moto con GPS, elige Cupo Compartido o Expreso y negocia tu tarifa justa.
              </Text>
            </View>

            <View style={styles.guiaCardItem}>
              <Text style={styles.guiaCardTitle}>🏪 Tienda y Ofertas Flash</Text>
              <Text style={styles.guiaCardDesc}>
                Revisa bodegas, pollerías y ferreterías abiertas y haz pedidos seguros con tu DNI.
              </Text>
            </View>

            <View style={styles.guiaCardItem}>
              <Text style={styles.guiaCardTitle}>📢 Mural Comunal</Text>
              <Text style={styles.guiaCardDesc}>
                Entérate de chambas, jornales y avisos vecinales de la zona sin intermediarios.
              </Text>
            </View>

            <Pressable
              onPress={async () => {
                await AsyncStorage.setItem('tamboruta_onboarding_visto', 'true');
                setModalBienvenida(false);
              }}
              style={{
                backgroundColor: '#059669',
                paddingVertical: 15,
                borderRadius: 14,
                marginTop: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                ¡Entendido, empezar!
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal Guía Interactiva Moderna por Roles */}
      <Modal
        visible={modalAyuda}
        transparent
        animationType="slide"
        onRequestClose={() => setModalAyuda(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 20,
              maxHeight: '88%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <View>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827' }}>
                  Guía de TamboRuta
                </Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                  Aprende cómo sacar el máximo provecho a la app
                </Text>
              </View>
              <Pressable onPress={() => setModalAyuda(false)} style={{ padding: 4 }}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 42, marginBottom: 12 }}
            >
              {(
                [
                  { id: 'pasajeros', label: '🙋 Pasajeros' },
                  { id: 'choferes', label: '🛵 Choferes' },
                  { id: 'tiendas', label: '🏪 Tiendas' },
                  { id: 'seguridad', label: '🛡️ Seguridad' },
                ] as const
              ).map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTabGuia(t.id)}
                  style={[
                    styles.guiaTabChip,
                    tabGuia === t.id && { backgroundColor: '#059669', borderColor: '#059669' },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: tabGuia === t.id ? '#fff' : '#374151',
                    }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
              {GUIA_CONTENIDO[tabGuia].map((bloque, idx) => (
                <View key={idx} style={styles.guiaCardItem}>
                  <Text style={styles.guiaCardTitle}>{bloque.titulo}</Text>
                  <Text style={styles.guiaCardDesc}>{bloque.desc}</Text>
                </View>
              ))}

              <View
                style={{
                  backgroundColor: '#ecfdf5',
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#a7f3d0',
                  marginTop: 6,
                  marginBottom: 24,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <ShieldCheck color="#059669" size={18} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#065f46' }}>
                    ¿Necesitas ayuda directa?
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#047857', marginBottom: 8 }}>
                  Escríbele directo al Supervisor de Tambogrande / CP3:
                </Text>
                <TextInput
                  placeholder="Escribe tu duda o reporte aquí..."
                  value={mensajeSupervisor}
                  onChangeText={setMensajeSupervisor}
                  multiline
                  style={[
                    styles.input,
                    { backgroundColor: '#fff', minHeight: 58, textAlignVertical: 'top' },
                  ]}
                />
                <Pressable
                  onPress={enviarSoporte}
                  style={{
                    backgroundColor: '#059669',
                    paddingVertical: 13,
                    borderRadius: 12,
                    marginTop: 10,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Send color="#fff" size={16} />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                    Enviar consulta al Supervisor
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Video Novedad / Anuncio del Admin con Omitir y No volver a mostrar */}
      <Modal
        visible={modalVideoPromo && !!videoPromo}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVideoPromo(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.75)',
            padding: 20,
          }}
        >
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 18 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <PlayCircle color="#7c3aed" size={20} />
                <Text style={{ fontSize: 17, fontWeight: '900', color: '#111827' }}>
                  Novedades TamboRuta
                </Text>
              </View>
              <Pressable onPress={() => setModalVideoPromo(false)}>
                <X color="#6b7280" size={22} />
              </Pressable>
            </View>

            {videoPromo?.videoUrl && VideoComponent ? (
              <VideoComponent
                source={{ uri: videoPromo.videoUrl }}
                style={{ width: '100%', height: 260, borderRadius: 14, backgroundColor: '#000' }}
                useNativeControls
                resizeMode="contain"
                shouldPlay
              />
            ) : (
              <Pressable
                onPress={() => videoPromo?.videoUrl && Linking.openURL(videoPromo.videoUrl)}
                style={{
                  height: 180,
                  borderRadius: 14,
                  backgroundColor: '#111827',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <PlayCircle color="#fff" size={44} />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                  Tocar para ver video informativo
                </Text>
              </Pressable>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable
                onPress={() => setModalVideoPromo(false)}
                style={{
                  flex: 1,
                  backgroundColor: '#f3f4f6',
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '700', color: '#374151', fontSize: 13 }}>
                  Omitir por ahora
                </Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (videoPromo?.clave) {
                    await AsyncStorage.setItem(videoPromo.clave, 'true');
                  }
                  setModalVideoPromo(false);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#111827',
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '800', color: '#fff', fontSize: 13 }}>
                  No volver a mostrar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Encuesta Interactiva con Opciones Reales */}
      <Modal
        visible={modalEncuesta && !!encuesta}
        transparent
        animationType="fade"
        onRequestClose={() => setModalEncuesta(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.55)',
            padding: 20,
          }}
        >
          <View style={{ backgroundColor: '#fff', padding: 22, borderRadius: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <BarChart3 color="#0284c7" size={20} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0284c7' }}>
                TU OPINIÓN CUENTA
              </Text>
            </View>

            <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 14 }}>
              {encuesta?.pregunta || '¿Qué te gustaría mejorar en TamboRuta?'}
            </Text>

            {(encuesta?.opciones || ['Más rutas a caseríos', 'Más tiendas y ofertas']).map(
              (op: string, idx: number) => {
                const elegida = opcionEncuestaSel === op;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => setOpcionEncuestaSel(op)}
                    style={{
                      padding: 13,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: elegida ? '#059669' : '#e5e7eb',
                      backgroundColor: elegida ? '#ecfdf5' : '#f9fafb',
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: '700',
                        fontSize: 14,
                        color: elegida ? '#065f46' : '#111827',
                      }}
                    >
                      {elegida ? '● ' : '○ '}
                      {op}
                    </Text>
                  </Pressable>
                );
              }
            )}

            <Pressable
              onPress={enviarVotoEncuesta}
              style={{
                backgroundColor: '#059669',
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 6,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Enviar mi voto</Text>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable
                onPress={() => setModalEncuesta(false)}
                style={{
                  flex: 1,
                  backgroundColor: '#f3f4f6',
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#4b5563', fontWeight: '700', fontSize: 12 }}>Omitir</Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (encuesta?.id) {
                    await AsyncStorage.setItem(`encuesta_no_mostrar_${encuesta.id}`, 'true');
                  }
                  setModalEncuesta(false);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#fee2e2',
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 12 }}>
                  No volver a mostrar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Ver Contraofertas */}
      <Modal
        visible={!!modalOfertas}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOfertas(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 24,
              paddingBottom: 40,
              maxHeight: '85%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
                  Contraofertas
                </Text>
                <Text style={{ color: '#9ca3af', fontSize: 13 }}>
                  Hacia: {modalOfertas?.destino}
                </Text>
              </View>
              <Pressable onPress={() => setModalOfertas(null)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            {ofertas.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <Clock color="#d1d5db" size={40} />
                <Text style={{ color: '#9ca3af', marginTop: 12 }}>Esperando choferes...</Text>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="always">
                {ofertas.map((o) => {
                  const esDestacado = o.choferPlan === 'premium' || o.choferPlan === 'oro';
                  const etiquetaPlan = getEtiquetaPlanChofer(o.choferPlan);

                  return (
                    <View
                      key={o.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: esDestacado ? '#fffbeb' : '#f9fafb',
                        borderRadius: 16,
                        padding: 14,
                        marginBottom: 10,
                        borderWidth: esDestacado ? 1.5 : 1,
                        borderColor: esDestacado ? '#f59e0b' : '#e5e7eb',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 21,
                            backgroundColor: esDestacado ? '#fef3c7' : '#d1fae5',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <Car color={esDestacado ? '#d97706' : '#059669'} size={20} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '700', color: '#111827', fontSize: 15 }}>
                            {o.choferNombre} {etiquetaPlan}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Star color="#fbbf24" size={13} fill="#fbbf24" />
                            <Text style={{ color: '#6b7280', fontSize: 12 }}>
                              {o.calificacion > 0 ? o.calificacion.toFixed(1) : 'Nuevo (0.0)'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#059669' }}>
                          S/ {o.precio}
                        </Text>
                        <Pressable
                          onPress={() => aceptarOferta(o, modalOfertas!)}
                          disabled={timeoutActivo}
                          style={{
                            backgroundColor: timeoutActivo ? '#a7f3d0' : '#059669',
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 10,
                            marginTop: 6,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                            {timeoutActivo ? 'Procesando...' : 'Aceptar'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#111827',
  },
  btnGuiaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  guiaTabChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  guiaCardItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  guiaCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  guiaCardDesc: {
    fontSize: 12,
    color: '#4b5563',
    lineHeight: 18,
  },
  flashHomeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: '#fef3c7',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  filterChip: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterChipActivo: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  filterTextActivo: { color: '#fff' },
  toggleMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  compactCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 1,
  },
  carBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d1fae5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  burbujaFlotante: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: '#059669',
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 999,
  },
  burbujaIconoWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  burbujaBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  burbujaBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  burbujaTitulo: { color: '#fff', fontSize: 12, fontWeight: '800' },
  burbujaSubtitulo: { color: '#d1fae5', fontSize: 11, fontWeight: '600' },
});