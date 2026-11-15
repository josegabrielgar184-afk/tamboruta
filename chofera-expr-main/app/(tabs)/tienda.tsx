import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { subirImagenStorage } from '@/lib/storage';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import {
  Zap,
  Store,
  X,
  Package,
  Heart,
  Edit3,
  Trash2,
  MessageCircle,
  Plus,
  Camera,
  Crown,
  MapPin,
  ClipboardList,
  QrCode,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { db, auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { useSoundAlerta } from '@/hooks/useSoundAlerta';
import type { CategoriaTienda, Usuario } from '@/types';

interface Producto {
  id: string;
  tiendaUid: string;
  tiendaNombre: string;
  tiendaPlan?: string;
  nombre: string;
  descripcion: string;
  precio?: number | null;
  stock: number;
  flash: boolean;
  flashExpiraEn?: number;
  categoria: string;
  imagenUrl?: string;
  createdAt: any;
}

const CATEGORIAS: string[] = [
  'Todas',
  'Pollerías',
  'Bodegas',
  'Ferreterías',
  'Carnicerías',
  'Farmacias',
];

const CATEGORIAS_PRODUCTO: string[] = [
  'Pollerías',
  'Bodegas',
  'Ferreterías',
  'Carnicerías',
  'Farmacias',
];

const tienePrecio = (p: Producto) => p.precio != null && p.precio > 0;

function getLimitePorPlan(plan?: string): number {
  if (plan === 'premium') return 999;
  if (plan === 'oro') return 40;
  if (plan === 'platino') return 25;
  return 12;
}

function getPesoPlan(plan?: string): number {
  if (plan === 'premium') return 4;
  if (plan === 'oro') return 3;
  if (plan === 'platino') return 2;
  return 1;
}

export default function TiendaScreen() {
  const user = useAuthStore((s) => s.user) as Usuario | null;
  const { reproducir } = useSoundAlerta();
  const router = useRouter();

  const [perfil, setPerfil] = useState<any>(null);
  const [configPagos, setConfigPagos] = useState<any>(null);
  const [tiendasInfo, setTiendasInfo] = useState<Record<string, any>>({});
  const uid = user?.uid || auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'usuarios', uid), (snap) => {
      setPerfil(snap.data() || null);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'configuracion', 'pagos'), (docSnap) => {
      if (docSnap.exists()) setConfigPagos(docSnap.data());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const qTiendas = query(collection(db, 'usuarios'), where('rol', '==', 'tienda'));
    const unsub = onSnapshot(qTiendas, (snap) => {
      const mapa: Record<string, any> = {};
      snap.forEach((d) => {
        mapa[d.id] = d.data();
      });
      setTiendasInfo(mapa);
    });
    return () => unsub();
  }, []);

  const esTienda = (perfil?.rol || user?.rol) === 'tienda';
  const planActual = (perfil?.plan || 'plata') as string;
  const limiteProductos = Number(perfil?.limiteProductos || getLimitePorPlan(planActual));
  const membresiaVencida =
    esTienda && (!perfil?.fechaVencimiento || perfil.fechaVencimiento < Date.now());

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriaSel, setCategoriaSel] = useState<string>('Todas');

  // Referencia para rotación automática del carrusel Flash
  const flashScrollRef = useRef<any>(null);
  const flashIndexRef = useRef(0);

  const [modalReserva, setModalReserva] = useState<Producto | null>(null);
  const [cantidadReserva, setCantidadReserva] = useState('1');
  const [dniReserva, setDniReserva] = useState('');
  const [caserioReserva, setCaserioReserva] = useState('');
  const [notaReserva, setNotaReserva] = useState('');
  const [procesandoReserva, setProcesandoReserva] = useState(false);

  const [tiendaCatalogo, setTiendaCatalogo] = useState<{ uid: string; nombre: string } | null>(null);

  const [modalNuevoProd, setModalNuevoProd] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [nuevoStock, setNuevoStock] = useState('10');
  const [nuevaCategoria, setNuevaCategoria] = useState<string>('Bodegas');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [nuevaImagenUrl, setNuevaImagenUrl] = useState('');
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const [modalFlash, setModalFlash] = useState(false);
  const [productoFlashSel, setProductoFlashSel] = useState<Producto | null>(null);
  const [titularFlash, setTitularFlash] = useState('');
  const [opFlash, setOpFlash] = useState('');
  const [voucherFlashUri, setVoucherFlashUri] = useState<string | null>(null);
  const [enviandoFlash, setEnviandoFlash] = useState(false);

  const [modalEditar, setModalEditar] = useState<Producto | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'productos'), where('activo', '!=', false));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const ahora = Date.now();
        const lista: Producto[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          if (data.nombre) {
            let esFlash = Boolean(data.flash);
            if (esFlash && data.flashExpiraEn && ahora > data.flashExpiraEn) {
              esFlash = false;
            }
            lista.push({ id: d.id, ...data, flash: esFlash });
          }
        });
        lista.sort((a, b) => {
          const diffRango = getPesoPlan(b.tiendaPlan) - getPesoPlan(a.tiendaPlan);
          if (diffRango !== 0) return diffRango;
          return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
        });
        setProductos(lista);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const productosFiltrados =
    categoriaSel === 'Todas'
      ? productos
      : productos.filter((p) => p.categoria === categoriaSel);

  const flash = productosFiltrados.filter((p) => p.flash);
  const normales = productosFiltrados.filter((p) => !p.flash);

  // Rotación automática sucesiva de las ofertas Flash cada 3.2 segundos
  useEffect(() => {
    flashIndexRef.current = 0;
    if (flash.length <= 1) return;

    const interval = setInterval(() => {
      flashIndexRef.current = (flashIndexRef.current + 1) % flash.length;
      flashScrollRef.current?.scrollTo({
        x: flashIndexRef.current * 177,
        animated: true,
      });
    }, 3200);

    return () => clearInterval(interval);
  }, [flash.length, categoriaSel]);

  const misProductos = productos.filter((p) => p.tiendaUid === uid);
  const misProductosCount = misProductos.length;
  const flashActivosCount = productos.filter((p) => p.flash).length;
  const cuposFlashGratis = Number(
    perfil?.flashGratisMes ?? (planActual === 'premium' ? 2 : planActual === 'oro' ? 1 : 0)
  );

  const abrirModalPublicarProducto = () => {
    if (membresiaVencida) {
      Alert.alert(
        'Membresía pausada',
        'Tus productos siguen guardados, pero debes renovar tu plan en Perfil para agregar nuevos.'
      );
      return;
    }
    if (misProductosCount >= limiteProductos) {
      Alert.alert(
        'Límite de tu rango alcanzado',
        `Tu plan ${planActual.toUpperCase()} permite hasta ${limiteProductos} productos activos. Mejora tu rango en Perfil para publicar más.`
      );
      return;
    }
    setModalNuevoProd(true);
  };

  const abrirModalFlash = () => {
    if (membresiaVencida) {
      Alert.alert('Membresía pausada', 'Renueva tu membresía en Perfil para usar el Modo Flash.');
      return;
    }
    if (misProductos.length === 0) {
      Alert.alert(
        'Sin productos',
        'Primero publica al menos un producto en tu catálogo para poder destacarlo en Modo Flash.'
      );
      return;
    }
    if (flashActivosCount >= 8) {
      Alert.alert('Cupos Flash llenos', 'Ya hay 8 ofertas Flash activas hoy en la app.');
      return;
    }
    setProductoFlashSel(misProductos[0]);
    setTitularFlash('');
    setOpFlash('');
    setVoucherFlashUri(null);
    setModalFlash(true);
  };

  const elegirVoucherFlash = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.4,
      });
      if (!result.canceled && result.assets[0].uri) {
        setVoucherFlashUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'No se pudo cargar la captura del Yape.');
    }
  };

  const enviarSolicitudFlash = async () => {
    if (!uid || !productoFlashSel || enviandoFlash) return;

    const usaCupoGratis = cuposFlashGratis > 0;

    if (!usaCupoGratis) {
      if (!titularFlash.trim() || opFlash.trim().length < 3 || !voucherFlashUri) {
        Alert.alert(
          'Faltan datos del pago',
          'Yapea S/ 3.00 a la cuenta mostrada arriba, escribe tu nombre, los últimos dígitos y sube la captura.'
        );
        return;
      }
    }

    setEnviandoFlash(true);
    try {
      if (usaCupoGratis) {
        await updateDoc(doc(db, 'productos', productoFlashSel.id), {
          flash: true,
          flashExpiraEn: Date.now() + 24 * 60 * 60 * 1000,
        });
        await updateDoc(doc(db, 'usuarios', uid), {
          flashGratisMes: Math.max(0, cuposFlashGratis - 1),
        });
        setModalFlash(false);
        Alert.alert(
          '⚡ ¡Modo Flash Activado!',
          `Tu producto "${productoFlashSel.nombre}" ya está brillando arriba por 24 horas usando tu beneficio ${planActual.toUpperCase()}.`
        );
      } else {
        const voucherUrl = await subirImagenStorage(
          voucherFlashUri!,
          `vouchers_flash/${uid}/${Date.now()}.jpg`
        );
        await addDoc(collection(db, 'mural'), {
          tipo: 'flash',
          estado: 'pendiente',
          autorUid: uid,
          autorNombre: perfil?.nombreTienda || perfil?.nombre || 'Tienda',
          productoId: productoFlashSel.id,
          titulo: `⚡ OFERTA FLASH: ${productoFlashSel.nombre} ${
            tienePrecio(productoFlashSel) ? `- S/ ${productoFlashSel.precio}` : ''
          }`,
          imagenUrl: productoFlashSel.imagenUrl || null,
          voucherUrl,
          titularYape: titularFlash.trim(),
          codigoOperacion: opFlash.trim(),
          monto: 3,
          createdAt: serverTimestamp(),
        });
        setModalFlash(false);
        Alert.alert(
          'Solicitud Flash Enviada',
          'Tu voucher de S/ 3.00 fue enviado al Administrador. Apenas lo apruebe aparecerá en el carrusel Flash por 24h.'
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo procesar el Modo Flash.');
    } finally {
      setEnviandoFlash(false);
    }
  };

  const elegirFotoProducto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.45,
      });
      if (!result.canceled && result.assets[0].uri) {
        setSubiendoFoto(true);
        const url = await subirImagenStorage(
          result.assets[0].uri,
          `productos/${uid ?? 'tienda'}/${Date.now()}.jpg`
        );
        setNuevaImagenUrl(url);
      }
    } catch {
      Alert.alert('Error', 'No se pudo subir la imagen del producto.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardarNuevoProducto = async () => {
    if (!uid || procesandoReserva) return;
    if (!nuevoNombre.trim()) {
      Alert.alert('Falta el nombre', 'Escribe el nombre del producto.');
      return;
    }

    setProcesandoReserva(true);
    try {
      const precioVal = nuevoPrecio.trim() === '' ? null : Number(nuevoPrecio);

      await addDoc(collection(db, 'productos'), {
        tiendaUid: uid,
        tiendaNombre: perfil?.nombreTienda || perfil?.nombre || user?.nombre || 'Tienda Local',
        tiendaPlan: planActual,
        nombre: nuevoNombre.trim(),
        descripcion: nuevaDescripcion.trim(),
        precio: precioVal,
        stock: Number(nuevoStock) || 1,
        flash: false,
        flashExpiraEn: null,
        activo: true,
        categoria: nuevaCategoria as CategoriaTienda,
        imagenUrl: nuevaImagenUrl || null,
        createdAt: serverTimestamp(),
      });

      setModalNuevoProd(false);
      setNuevoNombre('');
      setNuevoPrecio('');
      setNuevoStock('10');
      setNuevaDescripcion('');
      setNuevaImagenUrl('');
      Alert.alert('Publicado', 'Tu producto ya aparece en el catálogo de Tienda.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el producto.');
    } finally {
      setProcesandoReserva(false);
    }
  };

  const enviarReservaAntifraude = async () => {
    if (!uid || !modalReserva || procesandoReserva) return;
    const cant = Number(cantidadReserva);
    if (!cant || cant <= 0) {
      Alert.alert('Cantidad inválida', 'Ingresa una cantidad válida.');
      return;
    }
    if (!dniReserva.trim() || dniReserva.trim().length !== 8) {
      Alert.alert(
        'DNI obligatorio',
        'Ingresa un número de DNI válido de 8 dígitos para confirmar tu reserva.'
      );
      return;
    }
    if (!caserioReserva.trim()) {
      Alert.alert('Caserío obligatorio', 'Escribe tu sector o caserío (Ej: San Martín CP3).');
      return;
    }

    setProcesandoReserva(true);
    try {
      await addDoc(collection(db, 'reservas'), {
        productoId: modalReserva.id,
        productoNombre: modalReserva.nombre,
        precioUnitario: modalReserva.precio || 0,
        tiendaUid: modalReserva.tiendaUid,
        clienteUid: uid,
        clienteNombre: perfil?.nombre || user?.nombre || 'Cliente',
        dniCliente: dniReserva.trim(),
        caserioCliente: caserioReserva.trim(),
        cantidad: cant,
        nota: notaReserva.trim(),
        estado: 'pendiente',
        createdAt: serverTimestamp(),
      });
      reproducir('exito');
      Alert.alert(
        'Pedido registrado',
        'Tu pedido llegó a la lista digital de la tienda. Revisa el chat para coordinar el recojo o delivery.'
      );
      setModalReserva(null);
      setCantidadReserva('1');
      setDniReserva('');
      setCaserioReserva('');
      setNotaReserva('');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo procesar la reserva.');
    } finally {
      setProcesandoReserva(false);
    }
  };

  const abrirEdicion = (prod: Producto) => {
    setModalEditar(prod);
    setEditNombre(prod.nombre);
    setEditPrecio(prod.precio != null ? String(prod.precio) : '');
    setEditStock(String(prod.stock));
    setEditDescripcion(prod.descripcion || '');
  };

  const guardarEdicion = async () => {
    if (!modalEditar || procesandoReserva) return;
    setProcesandoReserva(true);
    try {
      const precioVal = editPrecio.trim() === '' ? null : Number(editPrecio);
      await updateDoc(doc(db, 'productos', modalEditar.id), {
        nombre: editNombre.trim(),
        precio: precioVal,
        stock: Number(editStock),
        descripcion: editDescripcion.trim(),
      });
      Alert.alert('Actualizado', 'Tu producto ha sido modificado.');
      setModalEditar(null);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el producto.');
    } finally {
      setProcesandoReserva(false);
    }
  };

  const eliminarProducto = async (prodId: string) => {
    Alert.alert('Eliminar producto', '¿Estás seguro de borrar este producto de la tienda?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'productos', prodId));
            Alert.alert('Eliminado', 'El producto fue retirado.');
          } catch {
            Alert.alert('Error', 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  const contactarVendedor = async (prod: Producto) => {
    if (!uid) return;
    if (uid === prod.tiendaUid) return;

    try {
      const qExist = query(
        collection(db, 'chats_tienda'),
        where('productoId', '==', prod.id),
        where('clienteUid', '==', uid)
      );
      const snap = await getDocs(qExist);
      if (!snap.empty) {
        router.push(`/chat/tienda/${snap.docs[0].id}` as any);
        return;
      }

      const chatRef = await addDoc(collection(db, 'chats_tienda'), {
        productoId: prod.id,
        productoNombre: prod.nombre,
        tiendaUid: prod.tiendaUid,
        tiendaNombre: prod.tiendaNombre,
        clienteUid: uid,
        clienteNombre: perfil?.nombre || user?.nombre || 'Cliente',
        estado: 'activo',
        createdAt: serverTimestamp(),
      });
      router.push(`/chat/tienda/${chatRef.id}` as any);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el chat con la tienda.');
    }
  };

  const renderPrecio = (p: Producto) => {
    if (tienePrecio(p)) {
      return <Text style={styles.cardPrecio}>S/ {p.precio}</Text>;
    }
    return <Text style={styles.cardConsultar}>Consultar</Text>;
  };

  const getInsigniaTienda = (plan?: string) => {
    if (plan === 'premium') return '💎 ';
    if (plan === 'oro') return '🥇 ';
    if (plan === 'platino') return '💠 ';
    return '';
  };

  const renderCard = ({ item }: { item: Producto }) => {
    const esMio = item.tiendaUid === uid;
    const infoLocal = tiendasInfo[item.tiendaUid];
    const localAbierto = infoLocal?.tiendaAbierta !== false;
    const referenciaLocal = infoLocal?.referenciaTienda;

    return (
      <View style={[styles.gridCard, !localAbierto && { opacity: 0.72, backgroundColor: '#f3f4f6' }]}>
        {item.imagenUrl ? (
          <Image source={{ uri: item.imagenUrl }} style={styles.cardImg} resizeMode="cover" />
        ) : (
          <View style={styles.cardImgPlaceholder}>
            <Package color="#9ca3af" size={28} />
          </View>
        )}

        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: localAbierto ? '#d1fae5' : '#fee2e2',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontWeight: '800',
              color: localAbierto ? '#065f46' : '#991b1b',
            }}
          >
            {localAbierto ? '🟢 ABIERTO' : '🔴 CERRADO'}
          </Text>
        </View>

        <Text style={styles.cardNombre} numberOfLines={2}>
          {item.nombre}
        </Text>
        <Pressable
          onPress={() => setTiendaCatalogo({ uid: item.tiendaUid, nombre: item.tiendaNombre })}
        >
          <Text style={styles.cardTienda} numberOfLines={1}>
            {getInsigniaTienda(item.tiendaPlan)}
            {item.tiendaNombre}
          </Text>
        </Pressable>

        {referenciaLocal ? (
          <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }} numberOfLines={1}>
            📍 {referenciaLocal}
          </Text>
        ) : null}

        <View style={styles.cardPrecioRow}>
          {renderPrecio(item)}
          <Text style={styles.cardStock}>Stk: {item.stock}</Text>
        </View>

        {esMio ? (
          <View style={styles.cardActions}>
            <Pressable onPress={() => abrirEdicion(item)} style={styles.btnEdit}>
              <Edit3 color="#0284c7" size={15} />
            </Pressable>
            <Pressable onPress={() => eliminarProducto(item.id)} style={styles.btnDelete}>
              <Trash2 color="#dc2626" size={15} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.cardActions}>
            <Pressable
              onPress={() => {
                if (!localAbierto) {
                  Alert.alert(
                    'Local Cerrado',
                    'Esta tienda está cerrada en este momento. Puedes dejarles un mensaje en el chat.'
                  );
                  return;
                }
                setModalReserva(item);
              }}
              style={[styles.btnReservar, !localAbierto && { backgroundColor: '#9ca3af' }]}
            >
              <Text style={styles.btnReservarTxt}>
                {localAbierto ? 'Pedir / Reservar' : 'Cerrado'}
              </Text>
            </Pressable>
            <Pressable onPress={() => contactarVendedor(item)} style={styles.btnChat}>
              <MessageCircle color="#0284c7" size={16} />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 56,
          paddingBottom: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#111827' }}>Tienda</Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            Pollerías, bodegas y comercios de Tambogrande
          </Text>
        </View>

        {esTienda && (
          <Pressable
            onPress={() => router.push('/(vendedor)/reservas' as any)}
            style={{
              backgroundColor: '#111827',
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ClipboardList color="#fff" size={16} />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Mis Pedidos</Text>
          </Pressable>
        )}
      </View>

      {/* Panel de Control del Comerciante */}
      {esTienda && (
        <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
          {membresiaVencida ? (
            <View
              style={{
                backgroundColor: '#fef2f2',
                borderWidth: 1,
                borderColor: '#f87171',
                borderRadius: 16,
                padding: 14,
              }}
            >
              <Text style={{ color: '#b91c1c', fontWeight: '800', fontSize: 15, marginBottom: 4 }}>
                Tienda en Modo Pausado
              </Text>
              <Text style={{ color: '#7f1d1d', fontSize: 13, marginBottom: 10 }}>
                Tus {misProductosCount} productos están seguros. Renueva tu plan desde S/ 3.00 en
                Perfil para volver a recibir pedidos.
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/perfil' as any)}
                style={{
                  backgroundColor: '#dc2626',
                  paddingVertical: 11,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                  Ir a Perfil para renovar
                </Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 12,
                borderWidth: 1,
                borderColor: '#d1fae5',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Crown color="#d97706" size={15} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#111827' }}>
                    {planActual.toUpperCase()}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700', marginTop: 2 }}>
                  Catálogo: {misProductosCount}/
                  {limiteProductos >= 999 ? '∞' : limiteProductos}
                </Text>
              </View>

              <Pressable
                onPress={abrirModalPublicarProducto}
                style={{
                  backgroundColor: '#059669',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Plus color="#fff" size={16} />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Publicar</Text>
              </Pressable>

              <Pressable
                onPress={abrirModalFlash}
                style={{
                  backgroundColor: '#f59e0b',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Zap color="#111827" size={16} fill="#111827" />
                <Text style={{ color: '#111827', fontWeight: '900', fontSize: 12 }}>Flash</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Barra fija de Categorías: siempre visible y bien proporcionada */}
      <View
        style={{
          backgroundColor: '#fff',
          paddingVertical: 10,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: '#e5e7eb',
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, alignItems: 'center' }}
        >
          {CATEGORIAS.map((cat) => {
            const activo = categoriaSel === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategoriaSel(cat)}
                style={{
                  backgroundColor: activo ? '#059669' : '#f3f4f6',
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 20,
                  marginRight: 8,
                  borderWidth: 1,
                  borderColor: activo ? '#059669' : '#e5e7eb',
                }}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    fontSize: 13,
                    color: activo ? '#fff' : '#374151',
                  }}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={normales}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            {flash.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Zap color="#f59e0b" size={22} fill="#f59e0b" />
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
                      Ofertas Flash (24h)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706' }}>
                    {flash.length} activa{flash.length > 1 ? 's' : ''} · Rotando ↻
                  </Text>
                </View>

                <ScrollView
                  ref={flashScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={177}
                  decelerationRate="fast"
                >
                  {flash.map((p) => {
                    const esMio = p.tiendaUid === uid;
                    const infoLocal = tiendasInfo[p.tiendaUid];
                    const localAbierto = infoLocal?.tiendaAbierta !== false;

                    return (
                      <View
                        key={p.id}
                        style={{
                          width: 165,
                          backgroundColor: '#fff',
                          borderRadius: 18,
                          padding: 14,
                          marginRight: 12,
                          borderWidth: 2,
                          borderColor: '#fbbf24',
                        }}
                      >
                        {p.imagenUrl ? (
                          <Image
                            source={{ uri: p.imagenUrl }}
                            style={{ width: '100%', height: 80, borderRadius: 12, marginBottom: 8 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={{
                              width: '100%',
                              height: 80,
                              borderRadius: 12,
                              backgroundColor: '#fef3c7',
                              justifyContent: 'center',
                              alignItems: 'center',
                              marginBottom: 8,
                            }}
                          >
                            <Package color="#f59e0b" size={28} />
                          </View>
                        )}
                        <Text
                          style={{ fontWeight: '700', color: '#111827', fontSize: 14 }}
                          numberOfLines={1}
                        >
                          {p.nombre}
                        </Text>
                        <Text
                          style={{ fontSize: 11, color: '#0284c7', fontWeight: '600' }}
                          numberOfLines={1}
                        >
                          {p.tiendaNombre}
                        </Text>
                        {tienePrecio(p) ? (
                          <Text
                            style={{
                              fontSize: 18,
                              fontWeight: '800',
                              color: '#059669',
                              marginTop: 4,
                            }}
                          >
                            S/ {p.precio}
                          </Text>
                        ) : (
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '700',
                              color: '#d97706',
                              marginTop: 4,
                            }}
                          >
                            Consultar
                          </Text>
                        )}

                        {esMio ? (
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                            <Pressable
                              onPress={() => abrirEdicion(p)}
                              style={{
                                flex: 1,
                                backgroundColor: '#e0f2fe',
                                paddingVertical: 6,
                                borderRadius: 8,
                                alignItems: 'center',
                              }}
                            >
                              <Edit3 color="#0284c7" size={14} />
                            </Pressable>
                            <Pressable
                              onPress={() => eliminarProducto(p.id)}
                              style={{
                                flex: 1,
                                backgroundColor: '#fee2e2',
                                paddingVertical: 6,
                                borderRadius: 8,
                                alignItems: 'center',
                              }}
                            >
                              <Trash2 color="#dc2626" size={14} />
                            </Pressable>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                            <Pressable
                              onPress={() => {
                                if (!localAbierto) {
                                  Alert.alert('Local Cerrado', 'Esta tienda está cerrada ahora.');
                                  return;
                                }
                                setModalReserva(p);
                              }}
                              style={{
                                flex: 1,
                                backgroundColor: localAbierto ? '#fbbf24' : '#9ca3af',
                                paddingVertical: 8,
                                borderRadius: 10,
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ fontWeight: '800', color: '#1f2937', fontSize: 12 }}>
                                {localAbierto ? 'Pedir' : 'Cerrado'}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => contactarVendedor(p)}
                              style={{
                                backgroundColor: '#e0f2fe',
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 10,
                                alignItems: 'center',
                              }}
                            >
                              <MessageCircle color="#0284c7" size={16} />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginBottom: 12,
                marginTop: 4,
              }}
            >
              <Heart color="#059669" size={20} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
                Catálogo General {categoriaSel !== 'Todas' ? `· ${categoriaSel}` : ''}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#059669" style={{ marginTop: 40 }} />
          ) : (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Store color="#d1d5db" size={40} />
              <Text style={{ color: '#9ca3af', marginTop: 12 }}>
                No hay productos en esta categoría.
              </Text>
            </View>
          )
        }
        renderItem={renderCard}
      />

      {/* Modal Solicitar Modo Flash 24h con QR Yape y Voucher */}
      <Modal
        visible={modalFlash}
        transparent
        animationType="slide"
        onRequestClose={() => setModalFlash(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <ScrollView
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: '92%',
            }}
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Zap color="#f59e0b" size={22} fill="#f59e0b" />
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
                  Activar Modo Flash (24h)
                </Text>
              </View>
              <Pressable onPress={() => setModalFlash(false)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            <Text style={{ fontSize: 13, color: '#4b5563', marginBottom: 12 }}>
              Tu oferta aparecerá en el carrusel brillante arriba de toda la Tienda por 24 horas
              exactas para liquidar stock rápido.
            </Text>

            <Text style={styles.label}>Elige el producto a destacar:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {misProductos.map((prod) => {
                const seleccionado = productoFlashSel?.id === prod.id;
                return (
                  <Pressable
                    key={prod.id}
                    onPress={() => setProductoFlashSel(prod)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 12,
                      marginRight: 8,
                      borderWidth: 1.5,
                      borderColor: seleccionado ? '#f59e0b' : '#e5e7eb',
                      backgroundColor: seleccionado ? '#fef3c7' : '#f9fafb',
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: '#111827', fontSize: 13 }}>
                      {prod.nombre}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700' }}>
                      {tienePrecio(prod) ? `S/ ${prod.precio}` : 'Consultar'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {cuposFlashGratis > 0 ? (
              <View
                style={{
                  backgroundColor: '#ecfdf5',
                  padding: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#a7f3d0',
                  marginBottom: 14,
                }}
              >
                <Text style={{ fontWeight: '800', color: '#065f46', fontSize: 14 }}>
                  🎁 Tienes {cuposFlashGratis} anuncio(s) Flash gratis este mes
                </Text>
                <Text style={{ fontSize: 12, color: '#047857', marginTop: 4 }}>
                  Por tu rango {planActual.toUpperCase()}, este anuncio se activa al instante sin
                  costo adicional.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.pasoBoxYape}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#6b21a8', marginBottom: 8 }}>
                    PASO 1: Yapea S/ 3.00 a esta cuenta oficial
                  </Text>

                  {configPagos?.qrUrl ? (
                    <Image
                      source={{ uri: configPagos.qrUrl }}
                      style={{
                        width: 155,
                        height: 155,
                        borderRadius: 12,
                        alignSelf: 'center',
                        backgroundColor: '#fff',
                      }}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={{
                        padding: 14,
                        backgroundColor: '#fff',
                        borderRadius: 10,
                        alignItems: 'center',
                      }}
                    >
                      <QrCode color="#6b21a8" size={28} />
                      <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        QR Oficial Rutas Express
                      </Text>
                    </View>
                  )}

                  <View style={{ alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#111827' }}>
                      📱 Yape: {configPagos?.numeroYape || 'Configurando...'}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#4b5563', marginTop: 2 }}>
                      👤 Titular: {configPagos?.titularYape || 'Administrador Rutas Express'}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827', marginBottom: 6 }}>
                  PASO 2: Confirma tu pago aquí abajo
                </Text>

                <TextInput
                  value={titularFlash}
                  onChangeText={setTitularFlash}
                  placeholder="Tu nombre (Titular que envió el Yape)"
                  style={styles.input}
                />
                <TextInput
                  value={opFlash}
                  onChangeText={setOpFlash}
                  placeholder="Últimos 3 dígitos de operación (Ej: 519)"
                  keyboardType="numeric"
                  style={styles.input}
                />

                <Pressable
                  onPress={elegirVoucherFlash}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: '#ecfdf5',
                    borderWidth: 1,
                    borderColor: '#a7f3d0',
                    borderRadius: 12,
                    paddingVertical: 12,
                    marginBottom: 10,
                  }}
                >
                  <Camera color="#059669" size={18} />
                  <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>
                    {voucherFlashUri ? '✓ Voucher adjuntado (Cambiar)' : 'Subir captura del Yape'}
                  </Text>
                </Pressable>

                {voucherFlashUri ? (
                  <Image
                    source={{ uri: voucherFlashUri }}
                    style={{ width: '100%', height: 110, borderRadius: 10, marginBottom: 10 }}
                    resizeMode="cover"
                  />
                ) : null}
              </>
            )}

            <Pressable
              onPress={enviarSolicitudFlash}
              disabled={enviandoFlash}
              style={{
                backgroundColor: '#f59e0b',
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                marginTop: 6,
              }}
            >
              <Text style={{ color: '#111827', fontWeight: '900', fontSize: 15 }}>
                {enviandoFlash
                  ? 'Enviando...'
                  : cuposFlashGratis > 0
                    ? '⚡ Activar Modo Flash Gratis Ahora'
                    : '⚡ Enviar Voucher para Activar Flash'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Publicar Nuevo Producto */}
      <Modal
        visible={modalNuevoProd}
        transparent
        animationType="slide"
        onRequestClose={() => setModalNuevoProd(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <ScrollView
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: '92%',
            }}
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
                Nuevo Producto
              </Text>
              <Pressable onPress={() => setModalNuevoProd(false)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            <Text style={styles.label}>Nombre del producto</Text>
            <TextInput
              value={nuevoNombre}
              onChangeText={setNuevoNombre}
              placeholder="Ej: 1/2 Pollo a la Brasa / Cemento Pacasmayo"
              style={styles.input}
            />

            <Text style={styles.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {CATEGORIAS_PRODUCTO.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setNuevaCategoria(cat)}
                  style={{
                    backgroundColor: nuevaCategoria === cat ? '#059669' : '#f3f4f6',
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 12,
                    marginRight: 8,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: '700',
                      fontSize: 13,
                      color: nuevaCategoria === cat ? '#fff' : '#374151',
                    }}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Precio (S/) - opcional</Text>
                <TextInput
                  value={nuevoPrecio}
                  onChangeText={setNuevoPrecio}
                  keyboardType="numeric"
                  placeholder="Vacío = Consultar"
                  style={styles.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Stock disponible</Text>
                <TextInput
                  value={nuevoStock}
                  onChangeText={setNuevoStock}
                  keyboardType="numeric"
                  placeholder="10"
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={styles.label}>Foto del producto</Text>
            <Pressable
              onPress={elegirFotoProducto}
              style={{
                backgroundColor: '#f9fafb',
                borderWidth: 1,
                borderColor: '#d1d5db',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 14,
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              {subiendoFoto ? (
                <ActivityIndicator color="#059669" />
              ) : nuevaImagenUrl ? (
                <Image
                  source={{ uri: nuevaImagenUrl }}
                  style={{ width: '100%', height: 120, borderRadius: 10 }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Camera color="#059669" size={22} />
                  <Text style={{ color: '#059669', fontWeight: '700', fontSize: 12, marginTop: 4 }}>
                    Subir foto de galería
                  </Text>
                </View>
              )}
            </Pressable>

            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput
              value={nuevaDescripcion}
              onChangeText={setNuevaDescripcion}
              placeholder="Detalles, porción, marca o promoción..."
              multiline
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            />

            <Pressable
              onPress={guardarNuevoProducto}
              disabled={procesandoReserva || subiendoFoto}
              style={{
                backgroundColor: '#059669',
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                marginTop: 14,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {procesandoReserva ? 'Publicando...' : 'Publicar producto'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Reserva Antifraude */}
      <Modal
        visible={!!modalReserva}
        transparent
        animationType="slide"
        onRequestClose={() => setModalReserva(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <ScrollView
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: '90%',
            }}
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
                Hacer Pedido / Reserva
              </Text>
              <Pressable onPress={() => setModalReserva(null)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            <Text style={{ color: '#374151', fontSize: 15, marginBottom: 2, fontWeight: '700' }}>
              {modalReserva?.nombre}
            </Text>
            {modalReserva && tienePrecio(modalReserva) ? (
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#059669', marginBottom: 10 }}>
                S/ {modalReserva.precio}
              </Text>
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#d97706', marginBottom: 10 }}>
                Consultar precio en chat
              </Text>
            )}

            <View
              style={{
                backgroundColor: '#fef3c7',
                padding: 10,
                borderRadius: 10,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#fde68a',
              }}
            >
              <Text style={{ fontSize: 12, color: '#92400e', fontWeight: '700' }}>
                🛡️ Medida Antifraude: Para evitar pedidos falsos, ingresa tu DNI y tu caserío. Tu
                pedido le llegará ordenado a la tienda.
              </Text>
            </View>

            <Text style={styles.label}>Cantidad</Text>
            <TextInput
              value={cantidadReserva}
              onChangeText={setCantidadReserva}
              placeholder="1"
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Tu Nro de DNI (8 dígitos) *</Text>
            <TextInput
              value={dniReserva}
              onChangeText={setDniReserva}
              placeholder="Ej: 74839201"
              keyboardType="numeric"
              maxLength={8}
              style={styles.input}
            />

            <Text style={styles.label}>Tu Sector / Caserío *</Text>
            <TextInput
              value={caserioReserva}
              onChangeText={setCaserioReserva}
              placeholder="Ej: San Martín CP3"
              style={styles.input}
            />

            <Text style={styles.label}>Nota adicional (opcional)</Text>
            <TextInput
              value={notaReserva}
              onChangeText={setNotaReserva}
              placeholder="Ej: Con cremas / Para enviar con mototaxi..."
              multiline
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            />

            <Pressable
              onPress={enviarReservaAntifraude}
              disabled={procesandoReserva}
              style={{
                backgroundColor: '#059669',
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                marginTop: 12,
                opacity: procesandoReserva ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {procesandoReserva ? 'Enviando...' : 'Confirmar pedido seguro'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Catálogo de Tienda */}
      <Modal
        visible={!!tiendaCatalogo}
        transparent
        animationType="slide"
        onRequestClose={() => setTiendaCatalogo(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 24,
              paddingBottom: 40,
              maxHeight: '80%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
                {tiendaCatalogo?.nombre || ''}
              </Text>
              <Pressable onPress={() => setTiendaCatalogo(null)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            {tiendaCatalogo && tiendasInfo[tiendaCatalogo.uid]?.referenciaTienda ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: '#f3f4f6',
                  padding: 8,
                  borderRadius: 10,
                  marginBottom: 12,
                }}
              >
                <MapPin color="#059669" size={15} />
                <Text style={{ fontSize: 12, color: '#374151', fontWeight: '700' }}>
                  {tiendasInfo[tiendaCatalogo.uid].referenciaTienda}
                </Text>
              </View>
            ) : null}

            <FlatList
              data={productos.filter((p) => p.tiendaUid === tiendaCatalogo?.uid)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: '#f3f4f6',
                  }}
                >
                  {item.imagenUrl ? (
                    <Image
                      source={{ uri: item.imagenUrl }}
                      style={{ width: 60, height: 60, borderRadius: 10 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 10,
                        backgroundColor: '#f3f4f6',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Package color="#9ca3af" size={22} />
                    </View>
                  )}
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: '#111827' }}>{item.nombre}</Text>
                    <Text style={{ color: '#059669', fontWeight: '700' }}>
                      {tienePrecio(item) ? `S/ ${item.precio}` : 'Consultar'}
                    </Text>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Modal Editar Producto */}
      <Modal
        visible={!!modalEditar}
        transparent
        animationType="slide"
        onRequestClose={() => setModalEditar(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 24,
              paddingBottom: 40,
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
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
                Editar Producto
              </Text>
              <Pressable onPress={() => setModalEditar(null)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            <Text style={styles.label}>Nombre</Text>
            <TextInput value={editNombre} onChangeText={setEditNombre} style={styles.input} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Precio (S/) - opcional</Text>
                <TextInput
                  value={editPrecio}
                  onChangeText={setEditPrecio}
                  keyboardType="numeric"
                  placeholder="Vacío = Consultar"
                  style={styles.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Stock</Text>
                <TextInput
                  value={editStock}
                  onChangeText={setEditStock}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={styles.label}>Descripción</Text>
            <TextInput
              value={editDescripcion}
              onChangeText={setEditDescripcion}
              multiline
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            />

            <Pressable
              onPress={guardarEdicion}
              disabled={procesandoReserva}
              style={{
                backgroundColor: '#0284c7',
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                marginTop: 16,
                opacity: procesandoReserva ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {procesandoReserva ? 'Guardando...' : 'Guardar cambios'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pasoBoxYape: {
    backgroundColor: '#faf5ff',
    borderWidth: 1.5,
    borderColor: '#d8b4fe',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    elevation: 1,
  },
  cardImg: {
    width: '100%',
    height: 90,
    borderRadius: 12,
    marginBottom: 8,
  },
  cardImgPlaceholder: {
    width: '100%',
    height: 90,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardNombre: {
    fontWeight: '700',
    color: '#111827',
    fontSize: 14,
    minHeight: 36,
  },
  cardTienda: {
    color: '#0284c7',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  cardPrecioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  cardPrecio: {
    fontSize: 17,
    fontWeight: '800',
    color: '#059669',
  },
  cardConsultar: {
    fontSize: 14,
    fontWeight: '700',
    color: '#d97706',
  },
  cardStock: {
    color: '#9ca3af',
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  btnReservar: {
    flex: 1,
    backgroundColor: '#059669',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnReservarTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  btnChat: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnEdit: {
    flex: 1,
    backgroundColor: '#e0f2fe',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDelete: {
    flex: 1,
    backgroundColor: '#fee2e2',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
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
    marginBottom: 8,
  },
});