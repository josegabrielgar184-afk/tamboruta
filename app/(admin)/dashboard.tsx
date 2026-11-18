import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { deleteObject, getStorage, ref } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Crown,
  Zap,
  CheckCircle2,
  X,
  AlertTriangle,
  QrCode,
  Upload,
  BarChart3,
  FileText,
  Search,
  Video as VideoIcon,
  ShieldCheck,
  MessageSquare,
  Trash2,
  CheckCheck,
} from 'lucide-react-native';
import { db, auth } from '@/lib/firebase';
import { subirImagenStorage } from '@/lib/storage';
import { useAuthStore } from '@/store/useAuthStore';
import { scheduleNotification } from '@/lib/notificaciones';
import type { Usuario } from '@/types';
import { esRolAdmin } from '@/types';

type AdminTab = 'membresias' | 'flash' | 'equipo' | 'soporte' | 'config';

const SUPERADMIN_EMAILS = ['garricraft@gmail.com', 'josegabriel@gmail.com'];

function calcularParametrosPlan(plan: string) {
  const limiteProductos =
    plan === 'premium' ? 999 : plan === 'oro' ? 40 : plan === 'platino' ? 25 : 12;
  const prioridadSegundos =
    plan === 'premium' || plan === 'oro' ? 30 : plan === 'platino' ? 15 : 0;
  const flashGratisMes = plan === 'premium' ? 2 : plan === 'oro' ? 1 : 0;
  return { limiteProductos, prioridadSegundos, flashGratisMes };
}

export default function AdminDashboardScreen() {
  const user = useAuthStore((s) => s.user) as Usuario | null;
  const router = useRouter();
  const emailActual = (auth.currentUser?.email || (user as any)?.email || '')
    .trim()
    .toLowerCase();

  const [tab, setTab] = useState<AdminTab>('membresias');
  const [loading, setLoading] = useState(true);
  const [modalImagen, setModalImagen] = useState<string | null>(null);

  const [solicitudesMembresia, setSolicitudesMembresia] = useState<any[]>([]);
  const [pagosMes, setPagosMes] = useState<any[]>([]);
  const [solicitudesFlash, setSolicitudesFlash] = useState<any[]>([]);
  const prevMemCount = useRef(0);
  const prevFlashCount = useRef(0);

  const [todosUsuarios, setTodosUsuarios] = useState<any[]>([]);
  const [busquedaUsuario, setBusquedaUsuario] = useState('');

  const [videoPromoUrl, setVideoPromoUrl] = useState('');
  const [videoPromoActivo, setVideoPromoActivo] = useState(false);
  const [subiendoVideo, setSubiendoVideo] = useState(false);
  const [guardandoVideo, setGuardandoVideo] = useState(false);

  const [qrUrl, setQrUrl] = useState('');
  const [numeroYape, setNumeroYape] = useState('');
  const [titularYapeAdmin, setTitularYapeAdmin] = useState('');
  const [guiaPagoTexto, setGuiaPagoTexto] = useState(
    '1. Escanea el QR o yapea al número indicado.\n2. En el mensaje del Yape escribe tu NOMBRE COMPLETO de la app.\n3. Sube la captura aquí para activar al instante.'
  );
  const [subiendoQr, setSubiendoQr] = useState(false);
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  const [preguntaEncuesta, setPreguntaEncuesta] = useState('');
  const [opcion1, setOpcion1] = useState('');
  const [opcion2, setOpcion2] = useState('');
  const [opcion3, setOpcion3] = useState('');
  const [encuestasLista, setEncuestasLista] = useState<any[]>([]);
  const [creandoEncuesta, setCreandoEncuesta] = useState(false);
  const [tipoEncuesta, setTipoEncuesta] = useState<'cerrada' | 'abierta'>('cerrada');

  const [mensajesSoporte, setMensajesSoporte] = useState<any[]>([]);

  const rolStr = (user?.rol || '') as string;
  const esSuperAdmin = Boolean(
    rolStr === 'super_admin' ||
      rolStr === 'superadmin' ||
      (user as any)?.esSuperAdmin ||
      (emailActual && SUPERADMIN_EMAILS.includes(emailActual))
  );
  const esAyudante = Boolean((user as any)?.esAyudante || rolStr === 'moderador');
  const tieneAcceso = Boolean(user && (esRolAdmin(user.rol) || esSuperAdmin || esAyudante));

  const permisosUser = (user as any)?.permisos || {};
  const puedeMembresias = esSuperAdmin || permisosUser.aprobarMembresias !== false;
  const puedeFlash = esSuperAdmin || permisosUser.aprobarFlash !== false;

  useEffect(() => {
    if (!tieneAcceso) return;

    const qMem = query(
      collection(db, 'solicitudes_membresia'),
      where('estado', '==', 'pendiente')
    );
    const unsubMem = onSnapshot(
      qMem,
      (snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        if (lista.length > prevMemCount.current) {
          scheduleNotification(
            '💳 Nueva Membresía por verificar',
            'Un chofer o tienda envió su voucher de pago.'
          );
        }
        prevMemCount.current = lista.length;
        setSolicitudesMembresia(lista);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const mesActual = new Date().toISOString().slice(0, 7);
    const qPagos = query(
      collection(db, 'solicitudes_membresia'),
      where('estado', '==', 'aprobada')
    );
    const unsubPagos = onSnapshot(qPagos, (snap) => {
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((p) => !p.mesContable || p.mesContable === mesActual);
      setPagosMes(lista);
    });

    // Conectado con la colección 'mural' donde tienda.tsx envía los anuncios Flash
    const qFlash = query(
      collection(db, 'mural'),
      where('tipo', '==', 'flash'),
      where('estado', '==', 'pendiente')
    );
    const unsubFlash = onSnapshot(qFlash, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      if (lista.length > prevFlashCount.current) {
        scheduleNotification(
          '⚡ Nueva solicitud Flash (S/ 3)',
          'Una tienda quiere destacar su producto por 24 horas.'
        );
      }
      prevFlashCount.current = lista.length;
      setSolicitudesFlash(lista);
    });

    const unsubUsers = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setTodosUsuarios(lista);
    });

    const unsubConfig = onSnapshot(doc(db, 'configuracion', 'pagos'), (d) => {
      if (d.exists()) {
        const cfg = d.data() as any;
        if (cfg.qrUrl) setQrUrl(cfg.qrUrl);
        if (cfg.numeroYape) setNumeroYape(cfg.numeroYape);
        if (cfg.titularYape) setTitularYapeAdmin(cfg.titularYape);
        if (cfg.guiaPago) setGuiaPagoTexto(cfg.guiaPago);
      }
    });

    const unsubVideo = onSnapshot(doc(db, 'configuracion', 'video_promo'), (d) => {
      if (d.exists()) {
        const v = d.data() as any;
        setVideoPromoUrl(v.videoUrl || '');
        setVideoPromoActivo(Boolean(v.activo));
      }
    });

    const unsubEnc = onSnapshot(collection(db, 'encuestas'), (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      lista.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setEncuestasLista(lista);
    });

    const qSoporte = query(
      collection(db, 'soporte_supervisor'),
      orderBy('fecha', 'desc')
    );
    const unsubSoporte = onSnapshot(qSoporte, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setMensajesSoporte(lista);
    });

    return () => {
      unsubMem();
      unsubPagos();
      unsubFlash();
      unsubUsers();
      unsubConfig();
      unsubVideo();
      unsubEnc();
      unsubSoporte();
    };
  }, [tieneAcceso]);

  const eliminarVoucherStorage = async (url?: string) => {
    if (!url || !url.startsWith('http')) return;
    try {
      await deleteObject(ref(getStorage(), url));
    } catch {}
  };

  const aprobarChoferVerificado = async (chofer: any) => {
    try {
      await updateDoc(doc(db, 'usuarios', chofer.id), {
        estadoVerificacion: 'verificado',
        estadoMembresia: 'activa',
        fechaVencimiento: Date.now() + 15 * 24 * 60 * 60 * 1000,
      });
      Alert.alert(
        'Titularidad Verificada',
        `${chofer.nombre} ya tiene el sello Verificado y 15 días gratis.`
      );
    } catch {
      Alert.alert('Error', 'No se pudo verificar.');
    }
  };

  const aprobarMembresia = async (sol: any) => {
    if (!puedeMembresias) {
      Alert.alert('Sin permiso', 'El Super Admin no te habilitó aprobar membresías.');
      return;
    }
    try {
      const uObj = todosUsuarios.find((u) => u.id === sol.uid);
      const baseFecha =
        uObj?.fechaVencimiento && uObj.fechaVencimiento > Date.now()
          ? uObj.fechaVencimiento
          : Date.now();
      const dias = Number(sol.dias || 30);
      const plan = sol.plan || 'plata';
      const { limiteProductos, prioridadSegundos, flashGratisMes } = calcularParametrosPlan(plan);

      await updateDoc(doc(db, 'usuarios', sol.uid), {
        estadoMembresia: 'activa',
        plan,
        limiteProductos,
        prioridadSegundos,
        flashGratisMes,
        ventaja3Seg: plan === 'oro' || plan === 'premium',
        fechaVencimiento: baseFecha + dias * 24 * 60 * 60 * 1000,
        pagoPendiente: false,
      });

      await eliminarVoucherStorage(sol.voucherUrl);

      await updateDoc(doc(db, 'solicitudes_membresia', sol.id), {
        estado: 'aprobada',
        voucherUrl: 'eliminado_storage',
        revisadoPor: user?.nombre || 'Admin',
        aprobadoEn: serverTimestamp(),
      });

      Alert.alert(
        'Membresía activada',
        `Plan ${sol.planNombre} (+${dias} días) activado. El voucher se eliminó de Storage.`
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo aprobar.');
    }
  };

  const rechazarMembresia = async (sol: any) => {
    await eliminarVoucherStorage(sol.voucherUrl);
    await updateDoc(doc(db, 'solicitudes_membresia', sol.id), {
      estado: 'rechazada',
      voucherUrl: 'eliminado_storage',
      revisadoPor: user?.nombre || 'Admin',
    }).catch(() => {});
  };

  const aprobarFlash = async (item: any) => {
    if (!puedeFlash) {
      Alert.alert('Sin permiso', 'El Super Admin no te habilitó aprobar anuncios Flash.');
      return;
    }
    try {
      const expiraEn = Date.now() + 24 * 60 * 60 * 1000;
      if (item.productoId) {
        await updateDoc(doc(db, 'productos', item.productoId), {
          flash: true,
          flashExpiraEn: expiraEn,
          estadoPromocion: 'aprobado',
        }).catch(() => {});
      }

      await eliminarVoucherStorage(item.voucherUrl);

      await updateDoc(doc(db, 'mural', item.id), {
        estado: 'activa',
        voucherUrl: 'eliminado_storage',
        expiraEn,
        revisadoPor: user?.nombre || 'Admin',
        aprobadoEn: serverTimestamp(),
      });

      Alert.alert(
        'Flash publicado (24h)',
        'El producto ya gira en la sección Flash de Tienda y el voucher fue limpiado.'
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo aprobar el Flash.');
    }
  };

  const rechazarFlash = async (item: any) => {
    await eliminarVoucherStorage(item.voucherUrl);
    await updateDoc(doc(db, 'mural', item.id), {
      estado: 'rechazada',
      voucherUrl: 'eliminado_storage',
      revisadoPor: user?.nombre || 'Admin',
    }).catch(() => {});
  };

  const toggleAyudante = async (targetUser: any) => {
    if (!esSuperAdmin) return;
    const esModActual = Boolean(targetUser.esAyudante || targetUser.rol === 'moderador');
    try {
      if (esModActual) {
        await updateDoc(doc(db, 'usuarios', targetUser.id), {
          rol: targetUser.rolAnterior || 'pasajero',
          esAyudante: false,
          permisos: null,
        });
        Alert.alert('Actualizado', `${targetUser.nombre} ya no es ayudante.`);
      } else {
        await updateDoc(doc(db, 'usuarios', targetUser.id), {
          rolAnterior: targetUser.rol || 'pasajero',
          rol: 'moderador',
          esAyudante: true,
          permisos: {
            aprobarMembresias: true,
            aprobarFlash: true,
            moderarMural: true,
          },
        });
        Alert.alert(
          'Ayudante asignado',
          `${targetUser.nombre} ahora puede ayudarte a revisar pagos y Mural (sin acceso a tu QR Yape).`
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo cambiar el rol.');
    }
  };

  const togglePermisoAyudante = async (
    targetUser: any,
    clave: 'aprobarMembresias' | 'aprobarFlash' | 'moderarMural'
  ) => {
    if (!esSuperAdmin) return;
    const actuales = targetUser.permisos || {
      aprobarMembresias: true,
      aprobarFlash: true,
      moderarMural: true,
    };
    await updateDoc(doc(db, 'usuarios', targetUser.id), {
      permisos: {
        ...actuales,
        [clave]: !actuales[clave],
      },
    }).catch(() => {});
  };

  const seleccionarVideoGaleria = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.8,
      });
      if (!res.canceled && res.assets[0].uri) {
        setSubiendoVideo(true);
        const url = await subirImagenStorage(
          res.assets[0].uri,
          `configuracion/video_promo_${Date.now()}.mp4`
        );
        setVideoPromoUrl(url);
        setVideoPromoActivo(true);
        Alert.alert('Video listo', 'Pulsa Guardar Video Promo para activarlo en tu pantalla.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo subir el video.');
    } finally {
      setSubiendoVideo(false);
    }
  };

  const guardarVideoPromo = async () => {
    if (!esSuperAdmin) return;
    setGuardandoVideo(true);
    try {
      await setDoc(
        doc(db, 'configuracion', 'video_promo'),
        {
          videoUrl: videoPromoUrl.trim(),
          activo: videoPromoActivo,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      Alert.alert(
        'Video guardado',
        videoPromoActivo
          ? 'Activado en tu cuenta Super Admin.'
          : 'Desactivado.'
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar.');
    } finally {
      setGuardandoVideo(false);
    }
  };

  const subirImagenQr = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (!res.canceled && res.assets[0].uri) {
        setSubiendoQr(true);
        const url = await subirImagenStorage(res.assets[0].uri, `configuracion/qr_yape_oficial.jpg`);
        setQrUrl(url);
      }
    } catch {
      Alert.alert('Error', 'No se pudo subir la imagen del QR.');
    } finally {
      setSubiendoQr(false);
    }
  };

  const guardarConfigPagos = async () => {
    if (!esSuperAdmin) return;
    setGuardandoConfig(true);
    try {
      await setDoc(
        doc(db, 'configuracion', 'pagos'),
        {
          qrUrl: qrUrl.trim(),
          numeroYape: numeroYape.trim(),
          titularYape: titularYapeAdmin.trim(),
          guiaPago: guiaPagoTexto.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      Alert.alert('Guardado', 'Tu QR, número de Yape y guía visual ya están activos en toda la app.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar.');
    } finally {
      setGuardandoConfig(false);
    }
  };

  const lanzarEncuesta = async () => {
    if (!esSuperAdmin) return;
    if (!preguntaEncuesta.trim()) {
      Alert.alert('Faltan datos', 'Escribe la pregunta de la encuesta.');
      return;
    }
    if (tipoEncuesta === 'cerrada' && (!opcion1.trim() || !opcion2.trim())) {
      Alert.alert('Faltan datos', 'Escribe al menos 2 opciones de respuesta para la encuesta cerrada.');
      return;
    }
    setCreandoEncuesta(true);
    try {
      const semanaActual = obtenerSemanaActual();
      for (const enc of encuestasLista) {
        if (enc.activa && enc.semana === semanaActual) {
          await updateDoc(doc(db, 'encuestas', enc.id), { activa: false }).catch(() => {});
        }
      }

      const datosEncuesta: any = {
        pregunta: preguntaEncuesta.trim(),
        tipo: tipoEncuesta,
        semana: semanaActual,
        activa: true,
        creadoPor: user?.nombre || 'Super Admin',
        createdAt: serverTimestamp(),
      };

      if (tipoEncuesta === 'cerrada') {
        const opciones = [opcion1.trim(), opcion2.trim()];
        if (opcion3.trim()) opciones.push(opcion3.trim());
        datosEncuesta.opciones = opciones;
        datosEncuesta.votos = {};
      } else {
        datosEncuesta.respuestas = {};
      }

      await addDoc(collection(db, 'encuestas'), datosEncuesta);

      setPreguntaEncuesta('');
      setOpcion1('');
      setOpcion2('');
      setOpcion3('');
      Alert.alert('Encuesta semanal publicada', `Semana ${semanaActual}. Los usuarios la verán al abrir TamboRuta.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo crear la encuesta.');
    } finally {
      setCreandoEncuesta(false);
    }
  };

  const cerrarEncuesta = async (encId: string) => {
    await updateDoc(doc(db, 'encuestas', encId), { activa: false }).catch(() => {});
  };

  const obtenerSemanaActual = () => {
    const ahora = new Date();
    const enero4 = new Date(ahora.getFullYear(), 0, 4);
    const diaSemana = (ahora.getDay() + 6) % 7;
    const diffDias = Math.floor((ahora.getTime() - enero4.getTime()) / 86400000);
    const numSemana = Math.ceil((diffDias + enero4.getDay() + 1) / 7);
    return `${ahora.getFullYear()}-W${String(numSemana).padStart(2, '0')}`;
  };

  const marcarSoporteResuelto = async (solId: string) => {
    await updateDoc(doc(db, 'soporte_supervisor', solId), {
      atendido: true,
      resueltoEn: serverTimestamp(),
    }).catch(() => {});
  };

  const eliminarMensajeSoporte = async (solId: string) => {
    Alert.alert('Eliminar consulta', '¿Seguro que deseas eliminar este mensaje?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, eliminar',
        style: 'destructive',
        onPress: () => {
          updateDoc(doc(db, 'soporte_supervisor', solId), {
            eliminado: true,
          }).catch(() => {});
        },
      },
    ]);
  };

  if (!tieneAcceso) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          backgroundColor: '#f9fafb',
        }}
      >
        <AlertTriangle color="#ef4444" size={48} />
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 12 }}>
          Acceso Denegado
        </Text>
        <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 6, marginBottom: 20 }}>
          No tienes permisos de administración para ver este panel.
        </Text>
        <Pressable
          onPress={() => router.replace('/(tabs)/perfil' as any)}
          style={{
            backgroundColor: '#059669',
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Volver al perfil</Text>
        </Pressable>
      </View>
    );
  }

  const choferesPendientes = todosUsuarios.filter(
    (u) => u.rol === 'chofer' && u.estadoVerificacion === 'pendiente'
  );

  const usuariosFiltrados = todosUsuarios.filter((u) => {
    if (u.id === user?.uid) return false;
    const q = busquedaUsuario.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.nombre || '').toLowerCase().includes(q) ||
      (u.nombreTienda || '').toLowerCase().includes(q) ||
      (u.placa || '').toLowerCase().includes(q)
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 52,
          paddingBottom: 12,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderColor: '#e5e7eb',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Pressable
            onPress={() => router.replace('/(tabs)' as any)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: '#f3f4f6',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <ArrowLeft color="#111827" size={20} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
              {esSuperAdmin ? 'Super Admin 👑' : 'Panel de Ayudante 🛡️'}
            </Text>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>
              Control de pagos, verificaciones, ayudantes y QR Yape
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 3, gap: 3 }}>
          <Pressable
            onPress={() => setTab('membresias')}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: tab === 'membresias' ? '#059669' : 'transparent',
            }}
          >
            <Text
              style={{
                fontWeight: '800',
                fontSize: 11,
                color: tab === 'membresias' ? '#fff' : '#4b5563',
              }}
            >
              Pagos ({solicitudesMembresia.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab('flash')}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: tab === 'flash' ? '#d97706' : 'transparent',
            }}
          >
            <Text
              style={{
                fontWeight: '800',
                fontSize: 11,
                color: tab === 'flash' ? '#fff' : '#4b5563',
              }}
            >
              Flash ({solicitudesFlash.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab('equipo')}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: tab === 'equipo' ? '#111827' : 'transparent',
            }}
          >
            <Text
              style={{
                fontWeight: '800',
                fontSize: 11,
                color: tab === 'equipo' ? '#fff' : '#4b5563',
              }}
            >
              Cuentas ({choferesPendientes.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab('soporte')}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: tab === 'soporte' ? '#0284c7' : 'transparent',
            }}
          >
            <Text
              style={{
                fontWeight: '800',
                fontSize: 11,
                color: tab === 'soporte' ? '#fff' : '#4b5563',
              }}
            >
              Soporte ({mensajesSoporte.filter((m) => !m.atendido && !m.eliminado).length})
            </Text>
          </Pressable>

          {esSuperAdmin && (
            <Pressable
              onPress={() => setTab('config')}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 9,
                alignItems: 'center',
                backgroundColor: tab === 'config' ? '#7c3aed' : 'transparent',
              }}
            >
              <Text
                style={{
                  fontWeight: '800',
                  fontSize: 11,
                  color: tab === 'config' ? '#fff' : '#4b5563',
                }}
              >
                Mi QR
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#059669" style={{ marginTop: 40 }} />
      ) : tab === 'membresias' ? (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 }}>
            Solicitudes de Membresía Pendientes
          </Text>
          {solicitudesMembresia.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 28, backgroundColor: '#fff', borderRadius: 16 }}>
              <Crown color="#d1d5db" size={36} />
              <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>
                No hay pagos de membresía pendientes.
              </Text>
            </View>
          ) : (
            solicitudesMembresia.map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  padding: 14,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>
                    {item.nombre} ({item.rol})
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: '#059669' }}>
                    S/ {item.monto}.00
                  </Text>
                </View>
                <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 3 }}>
                  Plan: <Text style={{ fontWeight: '700' }}>{item.planNombre}</Text> (+{item.dias} días)
                </Text>
                <Text style={{ color: '#4b5563', fontSize: 13 }}>
                  Titular Yape: <Text style={{ fontWeight: '800' }}>{item.titularYape}</Text> · Op: #{item.codigoOperacion}
                </Text>

                {item.iaAnalisis && (
                  <View
                    style={{
                      backgroundColor: '#ecfdf5',
                      padding: 8,
                      borderRadius: 8,
                      marginTop: 6,
                      borderWidth: 1,
                      borderColor: '#a7f3d0',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#047857' }}>
                      🤖 IA OCR ({item.iaAnalisis.confianza}):
                    </Text>
                    <Text style={{ fontSize: 11, color: '#065f46' }}>
                      {item.iaAnalisis.resumenTexto}
                    </Text>
                  </View>
                )}

                {item.voucherUrl && item.voucherUrl.startsWith('http') && (
                  <Pressable onPress={() => setModalImagen(item.voucherUrl)} style={{ marginVertical: 10 }}>
                    <Image
                      source={{ uri: item.voucherUrl }}
                      style={{ width: '100%', height: 170, borderRadius: 10 }}
                      resizeMode="cover"
                    />
                    <Text style={{ color: '#059669', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>
                      Toca para ampliar voucher
                    </Text>
                  </Pressable>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <Pressable
                    onPress={() => aprobarMembresia(item)}
                    style={{
                      flex: 2,
                      backgroundColor: '#059669',
                      paddingVertical: 11,
                      borderRadius: 10,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <CheckCircle2 color="#fff" size={16} />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                      Aprobar y borrar foto
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => rechazarMembresia(item)}
                    style={{
                      flex: 1,
                      backgroundColor: '#fee2e2',
                      paddingVertical: 11,
                      borderRadius: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 12 }}>Rechazar</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          <View style={{ marginTop: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <FileText color="#111827" size={18} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>
                Pagos verificados este mes ({pagosMes.length})
              </Text>
            </View>
            {pagosMes.length === 0 ? (
              <Text style={{ color: '#6b7280', fontSize: 13 }}>
                Aún no hay pagos aprobados este mes.
              </Text>
            ) : (
              pagosMes.map((pago) => {
                const uActual = todosUsuarios.find((u) => u.id === pago.uid);
                const diasQuedan = uActual?.fechaVencimiento
                  ? Math.max(
                      0,
                      Math.ceil((uActual.fechaVencimiento - Date.now()) / (1000 * 60 * 60 * 24))
                    )
                  : 0;
                return (
                  <View
                    key={pago.id}
                    style={{
                      backgroundColor: '#fff',
                      padding: 12,
                      borderRadius: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: '#e5e7eb',
                    }}
                  >
                    <Text style={{ fontWeight: '800', fontSize: 13, color: '#111827' }}>
                      {pago.nombre} · Yape: {pago.titularYape}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#4b5563' }}>
                      Op #{pago.codigoOperacion} · S/ {pago.monto}.00 · Aprobado por: {pago.revisadoPor || 'Admin'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#059669', fontWeight: '700', marginTop: 2 }}>
                      Le quedan {diasQuedan} días · Voucher eliminado ✓
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      ) : tab === 'flash' ? (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 }}>
            Validación Modo Flash en Tienda (S/ 3 · 24h)
          </Text>
          {solicitudesFlash.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 30, backgroundColor: '#fff', borderRadius: 16 }}>
              <Zap color="#d1d5db" size={36} />
              <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>
                No hay promociones Flash pendientes de aprobación.
              </Text>
            </View>
          ) : (
            solicitudesFlash.map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  padding: 14,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#fde68a',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>
                    {item.autorNombre || item.tiendaNombre || 'Tienda'}
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#d97706' }}>
                    S/ {item.monto || 3}.00
                  </Text>
                </View>
                <Text style={{ color: '#374151', fontSize: 13, marginTop: 3 }}>
                  {item.titulo || item.productoNombre}
                </Text>
                <Text style={{ color: '#4b5563', fontSize: 12 }}>
                  Titular Yape: {item.titularYape || '-'} · Op: #{item.codigoOperacion || '-'}
                </Text>

                {item.voucherUrl && item.voucherUrl.startsWith('http') && (
                  <Pressable onPress={() => setModalImagen(item.voucherUrl)} style={{ marginVertical: 10 }}>
                    <Image
                      source={{ uri: item.voucherUrl }}
                      style={{ width: '100%', height: 170, borderRadius: 10 }}
                      resizeMode="contain"
                    />
                  </Pressable>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <Pressable
                    onPress={() => aprobarFlash(item)}
                    style={{
                      flex: 2,
                      backgroundColor: '#d97706',
                      paddingVertical: 11,
                      borderRadius: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                      Activar Flash 24h (Borra foto)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => rechazarFlash(item)}
                    style={{
                      flex: 1,
                      backgroundColor: '#fee2e2',
                      paddingVertical: 11,
                      borderRadius: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 12 }}>Rechazar</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : tab === 'equipo' ? (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          {choferesPendientes.length > 0 && (
            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <ShieldCheck color="#b45309" size={18} />
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#b45309' }}>
                  Choferes esperando validación de titularidad ({choferesPendientes.length})
                </Text>
              </View>
              {choferesPendientes.map((ch) => (
                <View
                  key={ch.id}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1.5,
                    borderColor: '#f59e0b',
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 15, color: '#111827' }}>{ch.nombre}</Text>
                  <Text style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>
                    DNI: {ch.dniNumero} · Placa: {ch.placa} ({ch.vehiculoModelo})
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
                    {ch.fotoDniUrl ? (
                      <Pressable onPress={() => setModalImagen(ch.fotoDniUrl)} style={{ flex: 1 }}>
                        <Image
                          source={{ uri: ch.fotoDniUrl }}
                          style={{ width: '100%', height: 110, borderRadius: 8 }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ) : null}
                    {ch.fotoPlacaUrl ? (
                      <Pressable onPress={() => setModalImagen(ch.fotoPlacaUrl)} style={{ flex: 1 }}>
                        <Image
                          source={{ uri: ch.fotoPlacaUrl }}
                          style={{ width: '100%', height: 110, borderRadius: 8 }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => aprobarChoferVerificado(ch)}
                    style={{
                      backgroundColor: '#059669',
                      paddingVertical: 11,
                      borderRadius: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                      ✓ Verificar Titularidad (15 días gratis)
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 4 }}>
            Usuarios y Equipo de Ayudantes
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
            {esSuperAdmin
              ? 'Busca cualquier vecino para nombrarlo Ayudante (sin acceso a tu QR Yape):'
              : 'Listado de usuarios registrados:'}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: 12,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              marginBottom: 12,
            }}
          >
            <Search color="#9ca3af" size={18} />
            <TextInput
              value={busquedaUsuario}
              onChangeText={setBusquedaUsuario}
              placeholder="Buscar por nombre, tienda o placa..."
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14 }}
            />
          </View>

          {usuariosFiltrados.map((u) => {
            const esMod = Boolean(u.esAyudante || u.rol === 'moderador');
            const perms = u.permisos || {
              aprobarMembresias: true,
              aprobarFlash: true,
              moderarMural: true,
            };

            return (
              <View
                key={u.id}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 10,
                  borderWidth: esMod ? 1.5 : 1,
                  borderColor: esMod ? '#059669' : '#e5e7eb',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 15, color: '#111827' }}>
                      {u.nombreTienda || u.nombre || 'Usuario'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>
                      Rol: {esMod ? '🛡️ AYUDANTE' : u.rol}
                    </Text>
                  </View>

                  {esSuperAdmin && (
                    <Pressable
                      onPress={() => toggleAyudante(u)}
                      style={{
                        backgroundColor: esMod ? '#fee2e2' : '#059669',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                      }}
                    >
                      <Text
                        style={{
                          color: esMod ? '#dc2626' : '#fff',
                          fontWeight: '800',
                          fontSize: 12,
                        }}
                      >
                        {esMod ? 'Quitar ayudante' : 'Hacer ayudante'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {esMod && esSuperAdmin && (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: '#f3f4f6', gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#065f46' }}>
                      Tareas habilitadas para este ayudante:
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#374151' }}>Aprobar Membresías</Text>
                      <Switch
                        value={Boolean(perms.aprobarMembresias)}
                        onValueChange={() => togglePermisoAyudante(u, 'aprobarMembresias')}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#374151' }}>Aprobar Flash 24h (S/ 3)</Text>
                      <Switch
                        value={Boolean(perms.aprobarFlash)}
                        onValueChange={() => togglePermisoAyudante(u, 'aprobarFlash')}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#374151' }}>Limpiar avisos del Mural</Text>
                      <Switch
                        value={Boolean(perms.moderarMural)}
                        onValueChange={() => togglePermisoAyudante(u, 'moderarMural')}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : tab === 'soporte' ? (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <MessageSquare color="#0284c7" size={18} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>
              Consultas de la Guía ({mensajesSoporte.filter((m) => !m.eliminado).length})
            </Text>
          </View>
          <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
            Mensajes enviados por usuarios desde la sección Guía de la app.
          </Text>

          {mensajesSoporte.filter((m) => !m.eliminado).length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 30, backgroundColor: '#fff', borderRadius: 16 }}>
              <MessageSquare color="#d1d5db" size={36} />
              <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>
                No hay consultas pendientes.
              </Text>
            </View>
          ) : (
            mensajesSoporte.filter((m) => !m.eliminado).map((msg) => {
              const fecha = msg.fecha?.seconds
                ? new Date(msg.fecha.seconds * 1000).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : 'Reciente';
              return (
                <View
                  key={msg.id}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: msg.atendido ? '#d1fae5' : '#e5e7eb',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: '#111827' }}>
                      {msg.nombre || 'Usuario'}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: msg.atendido ? '#059669' : '#d97706' }}>
                      {msg.atendido ? 'RESUELTO' : 'PENDIENTE'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>{fecha}</Text>
                  <Text style={{ fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 10 }}>
                    {msg.mensaje}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {!msg.atendido && (
                      <Pressable
                        onPress={() => marcarSoporteResuelto(msg.id)}
                        style={{
                          flex: 1,
                          backgroundColor: '#059669',
                          paddingVertical: 10,
                          borderRadius: 10,
                          alignItems: 'center',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          gap: 5,
                        }}
                      >
                        <CheckCheck color="#fff" size={15} />
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Marcar resuelto</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => eliminarMensajeSoporte(msg.id)}
                      style={{
                        flex: 1,
                        backgroundColor: '#fee2e2',
                        paddingVertical: 10,
                        borderRadius: 10,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 5,
                      }}
                    >
                      <Trash2 color="#dc2626" size={15} />
                      <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 12 }}>Eliminar</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          {/* BLOQUE 1: MI QR YAPE OFICIAL */}
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              borderWidth: 1.5,
              borderColor: '#059669',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <QrCode color="#059669" size={20} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
                Mi QR de Yape / Plin y Guía de Pago
              </Text>
            </View>

            <Pressable
              onPress={subirImagenQr}
              style={{
                backgroundColor: '#f9fafb',
                borderWidth: 1,
                borderColor: '#d1d5db',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 14,
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              {subiendoQr ? (
                <ActivityIndicator color="#059669" />
              ) : qrUrl ? (
                <Image
                  source={{ uri: qrUrl }}
                  style={{ width: 160, height: 160, borderRadius: 12 }}
                  resizeMode="contain"
                />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Upload color="#059669" size={22} />
                  <Text style={{ color: '#059669', fontWeight: '700', fontSize: 12, marginTop: 4 }}>
                    Subir imagen de tu QR Yape / Plin
                  </Text>
                </View>
              )}
            </Pressable>

            <TextInput
              value={numeroYape}
              onChangeText={setNumeroYape}
              placeholder="Tu número de Yape / Plin (Ej: 987 654 321)"
              keyboardType="phone-pad"
              style={inputStyle}
            />
            <TextInput
              value={titularYapeAdmin}
              onChangeText={setTitularYapeAdmin}
              placeholder="Nombre del titular que sale al yapear"
              style={inputStyle}
            />
            <TextInput
              value={guiaPagoTexto}
              onChangeText={setGuiaPagoTexto}
              placeholder="Instrucciones paso a paso para el usuario..."
              multiline
              style={[inputStyle, { minHeight: 75, textAlignVertical: 'top' }]}
            />

            <Pressable
              onPress={guardarConfigPagos}
              disabled={guardandoConfig}
              style={{
                backgroundColor: '#059669',
                paddingVertical: 13,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                {guardandoConfig ? 'Guardando...' : 'Guardar QR y Guía Visual'}
              </Text>
            </Pressable>
          </View>

          {/* BLOQUE 2: VIDEO PROMO */}
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#c4b5fd',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <VideoIcon color="#7c3aed" size={20} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
                  Video Promo (Solo SuperAdmin)
                </Text>
              </View>
              <Switch value={videoPromoActivo} onValueChange={setVideoPromoActivo} />
            </View>

            <Pressable
              onPress={seleccionarVideoGaleria}
              disabled={subiendoVideo}
              style={{
                backgroundColor: '#f5f3ff',
                borderWidth: 1,
                borderColor: '#c4b5fd',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              {subiendoVideo ? (
                <ActivityIndicator color="#7c3aed" />
              ) : (
                <Text style={{ color: '#6d28d9', fontWeight: '800', fontSize: 13 }}>
                  {videoPromoUrl ? '✓ Video cargado (Tocar para cambiar)' : '📹 Subir video desde galería'}
                </Text>
              )}
            </Pressable>

            <TextInput
              value={videoPromoUrl}
              onChangeText={setVideoPromoUrl}
              placeholder="O pega enlace directo del video (.mp4)"
              style={inputStyle}
            />

            <Pressable
              onPress={guardarVideoPromo}
              disabled={guardandoVideo}
              style={{
                backgroundColor: '#7c3aed',
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                {guardandoVideo ? 'Guardando...' : 'Guardar Video Promo'}
              </Text>
            </Pressable>
          </View>

          {/* BLOQUE 3: ENCUESTA SEMANAL */}
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: '#e5e7eb',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <BarChart3 color="#0284c7" size={20} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
                Encuesta Semanal ({obtenerSemanaActual()})
              </Text>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 }}>Tipo de encuesta:</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <Pressable
                onPress={() => setTipoEncuesta('cerrada')}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: tipoEncuesta === 'cerrada' ? '#0284c7' : '#f3f4f6',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: tipoEncuesta === 'cerrada' ? '#fff' : '#374151' }}>
                  Cerrada (opciones)
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTipoEncuesta('abierta')}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: tipoEncuesta === 'abierta' ? '#0284c7' : '#f3f4f6',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: tipoEncuesta === 'abierta' ? '#fff' : '#374151' }}>
                  Abierta (texto libre)
                </Text>
              </Pressable>
            </View>

            <TextInput
              value={preguntaEncuesta}
              onChangeText={setPreguntaEncuesta}
              placeholder="Pregunta (Ej: ¿Qué ruta nueva debemos agregar?)"
              style={inputStyle}
            />

            {tipoEncuesta === 'cerrada' && (
              <>
                <TextInput
                  value={opcion1}
                  onChangeText={setOpcion1}
                  placeholder="Opción 1"
                  style={inputStyle}
                />
                <TextInput
                  value={opcion2}
                  onChangeText={setOpcion2}
                  placeholder="Opción 2"
                  style={inputStyle}
                />
                <TextInput
                  value={opcion3}
                  onChangeText={setOpcion3}
                  placeholder="Opción 3 (opcional)"
                  style={inputStyle}
                />
              </>
            )}

            {tipoEncuesta === 'abierta' && (
              <View style={{ backgroundColor: '#f0f9ff', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#bae6fd' }}>
                <Text style={{ fontSize: 12, color: '#0369a1', fontWeight: '600' }}>
                  El usuario responderá escribiendo libremente su opinión en un campo de texto.
                </Text>
              </View>
            )}

            <Pressable
              onPress={lanzarEncuesta}
              disabled={creandoEncuesta}
              style={{
                backgroundColor: '#0284c7',
                paddingVertical: 13,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                {creandoEncuesta ? 'Publicando...' : 'Publicar Encuesta Semanal'}
              </Text>
            </Pressable>

            {encuestasLista.map((enc) => {
              const totalParticipaciones = enc.tipo === 'abierta'
                ? Object.keys(enc.respuestas || {}).length
                : Object.keys(enc.votos || {}).length;
              return (
                <View
                  key={enc.id}
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderColor: '#f3f4f6',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '800', color: '#111827', flex: 1 }}>
                      {enc.pregunta}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '800',
                        color: enc.activa ? '#059669' : '#9ca3af',
                      }}
                    >
                      {enc.activa ? 'ACTIVA' : 'CERRADA'} · {enc.tipo || 'cerrada'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    Semana: {enc.semana || '-'} · Participaciones: {totalParticipaciones}
                  </Text>
                  {enc.tipo === 'abierta' && enc.respuestas && Object.keys(enc.respuestas).length > 0 && (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {Object.entries(enc.respuestas).map(([uidResp, texto]) => (
                        <View key={uidResp} style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280' }}>{uidResp.slice(0, 6)}</Text>
                          <Text style={{ fontSize: 13, color: '#111827', marginTop: 2 }}>{texto as string}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {enc.activa && (
                    <Pressable
                      onPress={() => cerrarEncuesta(enc.id)}
                      style={{ marginTop: 6 }}
                    >
                      <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700' }}>
                        Cerrar esta encuesta
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Modal ampliar imagen */}
      <Modal
        visible={!!modalImagen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalImagen(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.85)',
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => setModalImagen(null)}
            style={{
              position: 'absolute',
              top: 50,
              right: 20,
              zIndex: 10,
              backgroundColor: '#fff',
              padding: 8,
              borderRadius: 20,
            }}
          >
            <X color="#111827" size={24} />
          </Pressable>
          {modalImagen && (
            <Image
              source={{ uri: modalImagen }}
              style={{ width: '100%', height: '80%', borderRadius: 16 }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const inputStyle = {
  backgroundColor: '#f9fafb',
  borderWidth: 1,
  borderColor: '#d1d5db',
  borderRadius: 10,
  padding: 11,
  marginBottom: 8,
  fontSize: 14,
  color: '#111827',
} as any;