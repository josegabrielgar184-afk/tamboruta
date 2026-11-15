import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Package,
  CheckCircle2,
  X,
  MessageCircle,
  Clock,
  Plus,
  Trash2,
  Store,
  Upload,
  ShieldCheck,
  MapPin,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { db, auth } from '@/lib/firebase';
import { subirImagenStorage } from '@/lib/storage';
import { useAuthStore } from '@/store/useAuthStore';
import type { Usuario } from '@/types';

interface Reserva {
  id: string;
  productoId: string;
  productoNombre: string;
  precioUnitario?: number;
  tiendaUid: string;
  clienteUid: string;
  clienteNombre: string;
  dniCliente?: string;
  caserioCliente?: string;
  cantidad: number;
  nota: string;
  estado: 'pendiente' | 'confirmada' | 'rechazada';
  createdAt: any;
}

interface MiProducto {
  id: string;
  tiendaUid: string;
  tiendaNombre: string;
  nombre: string;
  descripcion: string;
  precio?: number | null;
  stock: number;
  flash: boolean;
  categoria: string;
  imagenUrl?: string;
  activo: boolean;
  createdAt: any;
}

const CATEGORIAS: string[] = [
  'Pollerías',
  'Bodegas',
  'Ferreterías',
  'Carnicerías',
  'Farmacias',
];

function getLimitePorPlan(plan?: string): number {
  if (plan === 'premium') return 999;
  if (plan === 'oro') return 40;
  if (plan === 'platino') return 25;
  return 12;
}

type Tab = 'reservas' | 'vitrina';

export default function ReservasScreen() {
  const user = useAuthStore((s) => s.user) as Usuario | null;
  const router = useRouter();
  const uid = user?.uid || auth.currentUser?.uid;

  const [perfil, setPerfil] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('reservas');
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [misProductos, setMisProductos] = useState<MiProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalProducto, setModalProducto] = useState(false);

  // Formulario nuevo producto
  const [pNombre, setPNombre] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pPrecio, setPPrecio] = useState('');
  const [pStock, setPStock] = useState('10');
  const [pFotoUri, setPFotoUri] = useState<string | null>(null);
  const [pCategoria, setPCategoria] = useState<string>('Bodegas');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'usuarios', uid), (snap) => {
      setPerfil(snap.data() || null);
    });
    return () => unsub();
  }, [uid]);

  const planActual = (perfil?.plan || 'plata') as string;
  const limiteProductos = Number(perfil?.limiteProductos || getLimitePorPlan(planActual));
  const nombreNegocio = perfil?.nombreTienda || perfil?.nombre || user?.nombre || 'Tienda Local';

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'reservas'), where('tiendaUid', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista: Reserva[] = [];
        snap.forEach((d) => lista.push({ id: d.id, ...(d.data() as any) }));
        lista.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setReservas(lista);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'productos'), where('tiendaUid', '==', uid));
    const unsub = onSnapshot(q, (snap) => {
      const lista: MiProducto[] = [];
      snap.forEach((d) => lista.push({ id: d.id, ...(d.data() as any) }));
      lista.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setMisProductos(lista);
    });
    return unsub;
  }, [uid]);

  const seleccionarFotoProducto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.45,
      });

      if (!result.canceled && result.assets[0].uri) {
        setPFotoUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'No se pudo abrir la galería.');
    }
  };

  const cambiarEstadoReserva = async (r: Reserva, nuevoEstado: 'confirmada' | 'rechazada') => {
    try {
      await updateDoc(doc(db, 'reservas', r.id), { estado: nuevoEstado });
      Alert.alert(
        nuevoEstado === 'confirmada' ? 'Pedido Confirmado' : 'Pedido Rechazado',
        nuevoEstado === 'confirmada'
          ? 'El pedido quedó marcado como confirmado en tu lista.'
          : 'El pedido fue marcado como rechazado.'
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo actualizar el pedido.');
    }
  };

  const abrirChatConCliente = async (r: Reserva) => {
    if (!uid) return;
    try {
      const qExist = query(
        collection(db, 'chats_tienda'),
        where('tiendaUid', '==', uid),
        where('clienteUid', '==', r.clienteUid)
      );
      const snap = await getDocs(qExist);
      if (!snap.empty) {
        router.push(`/chat/tienda/${snap.docs[0].id}` as any);
        return;
      }

      const chatRef = await addDoc(collection(db, 'chats_tienda'), {
        productoId: r.productoId,
        productoNombre: r.productoNombre,
        tiendaUid: uid,
        tiendaNombre: nombreNegocio,
        clienteUid: r.clienteUid,
        clienteNombre: r.clienteNombre,
        estado: 'activo',
        createdAt: serverTimestamp(),
      });
      router.push(`/chat/tienda/${chatRef.id}` as any);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el chat con el cliente.');
    }
  };

  const abrirAgregarProducto = () => {
    const activos = misProductos.filter((p) => p.activo !== false);
    if (activos.length >= limiteProductos) {
      Alert.alert(
        'Límite alcanzado',
        `Tu plan ${planActual.toUpperCase()} permite hasta ${limiteProductos} productos activos. Mejora tu rango en Perfil o elimina uno antiguo.`
      );
      return;
    }
    setModalProducto(true);
  };

  const guardarProducto = async () => {
    if (!uid) return;
    if (!pNombre.trim()) {
      Alert.alert('Faltan datos', 'El nombre del producto es obligatorio.');
      return;
    }

    setGuardando(true);
    try {
      let finalImageUrl: string | null = null;

      if (pFotoUri) {
        finalImageUrl = await subirImagenStorage(
          pFotoUri,
          `productos/${uid}/${Date.now()}.jpg`
        );
      }

      await addDoc(collection(db, 'productos'), {
        tiendaUid: uid,
        tiendaNombre: nombreNegocio,
        tiendaPlan: planActual,
        nombre: pNombre.trim(),
        descripcion: pDesc.trim(),
        precio: pPrecio.trim() ? Number(pPrecio) : null,
        stock: Number(pStock) || 1,
        flash: false,
        categoria: pCategoria,
        imagenUrl: finalImageUrl,
        activo: true,
        createdAt: serverTimestamp(),
      });

      Alert.alert('Éxito', 'Producto publicado en tu catálogo.');
      setModalProducto(false);
      setPNombre('');
      setPDesc('');
      setPPrecio('');
      setPStock('10');
      setPFotoUri(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarProducto = (p: MiProducto) => {
    Alert.alert('Eliminar producto', `¿Eliminar "${p.nombre}" de tu vitrina?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'productos', p.id));
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  const activos = misProductos.filter((p) => p.activo !== false);
  const pendientesCount = reservas.filter((r) => r.estado === 'pendiente').length;

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Pressable onPress={() => router.replace('/(tabs)/tienda' as any)}>
            <ArrowLeft color="#111827" size={24} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>
              Bandeja de Pedidos
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>{nombreNegocio}</Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            backgroundColor: '#e5e7eb',
            borderRadius: 14,
            padding: 4,
          }}
        >
          <Pressable
            onPress={() => setTab('reservas')}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: 'center',
              backgroundColor: tab === 'reservas' ? '#fff' : 'transparent',
            }}
          >
            <Text
              style={{
                fontWeight: '800',
                fontSize: 12,
                color: tab === 'reservas' ? '#059669' : '#6b7280',
              }}
            >
              📋 Tiques / Pedidos ({pendientesCount})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab('vitrina')}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: 'center',
              backgroundColor: tab === 'vitrina' ? '#fff' : 'transparent',
            }}
          >
            <Text
              style={{
                fontWeight: '800',
                fontSize: 12,
                color: tab === 'vitrina' ? '#059669' : '#6b7280',
              }}
            >
              🏪 Mi Vitrina ({activos.length})
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#059669" style={{ marginTop: 40 }} />
      ) : tab === 'reservas' ? (
        <FlatList
          data={reservas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Package color="#d1d5db" size={40} />
              <Text style={{ color: '#9ca3af', marginTop: 12 }}>
                Aún no tienes pedidos registrados.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const totalSoles =
              item.precioUnitario && item.precioUnitario > 0
                ? item.precioUnitario * Number(item.cantidad || 1)
                : null;

            return (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: item.estado === 'pendiente' ? '#a7f3d0' : '#e5e7eb',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontWeight: '800', color: '#111827', fontSize: 16 }}>
                      {item.cantidad}x {item.productoNombre}
                    </Text>
                    <Text style={{ color: '#374151', fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                      Cliente: {item.clienteNombre}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    {totalSoles !== null ? (
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#059669' }}>
                        S/ {totalSoles.toFixed(2)}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#d97706' }}>
                        A coordinar
                      </Text>
                    )}

                    {item.estado === 'pendiente' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Clock color="#f59e0b" size={12} />
                        <Text style={{ color: '#d97706', fontSize: 11, fontWeight: '700' }}>
                          Pendiente
                        </Text>
                      </View>
                    )}
                    {item.estado === 'confirmada' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <CheckCircle2 color="#059669" size={12} />
                        <Text style={{ color: '#059669', fontSize: 11, fontWeight: '700' }}>
                          Confirmado
                        </Text>
                      </View>
                    )}
                    {item.estado === 'rechazada' && (
                      <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                        Rechazado
                      </Text>
                    )}
                  </View>
                </View>

                {/* Ficha antifraude del cliente (DNI y Caserío) */}
                <View
                  style={{
                    backgroundColor: '#f3f4f6',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 10,
                    gap: 4,
                  }}
                >
                  {item.dniCliente ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <ShieldCheck color="#059669" size={14} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>
                        DNI verificado: {item.dniCliente}
                      </Text>
                    </View>
                  ) : null}
                  {item.caserioCliente ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <MapPin color="#0284c7" size={14} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>
                        Sector / Entrega: {item.caserioCliente}
                      </Text>
                    </View>
                  ) : null}
                  {item.nota ? (
                    <Text style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>
                      📝 Nota: {item.nota}
                    </Text>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {item.estado === 'pendiente' && (
                    <>
                      <Pressable
                        onPress={() => cambiarEstadoReserva(item, 'confirmada')}
                        style={{
                          flex: 2,
                          backgroundColor: '#059669',
                          paddingVertical: 11,
                          borderRadius: 12,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                          ✓ Confirmar pedido
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => cambiarEstadoReserva(item, 'rechazada')}
                        style={{
                          flex: 1,
                          backgroundColor: '#fee2e2',
                          paddingVertical: 11,
                          borderRadius: 12,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 12 }}>
                          Rechazar
                        </Text>
                      </Pressable>
                    </>
                  )}

                  <Pressable
                    onPress={() => abrirChatConCliente(item)}
                    style={{
                      backgroundColor: '#e0f2fe',
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                    }}
                  >
                    <MessageCircle color="#0284c7" size={16} />
                    <Text style={{ color: '#0284c7', fontWeight: '800', fontSize: 12 }}>Chat</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={misProductos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <View>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
                    Mi Vitrina ({planActual.toUpperCase()})
                  </Text>
                  <Text style={{ color: '#6b7280', fontSize: 13 }}>
                    {activos.length} / {limiteProductos >= 999 ? 'Ilimitados' : limiteProductos}{' '}
                    productos
                  </Text>
                </View>
                <Pressable
                  onPress={abrirAgregarProducto}
                  style={{
                    backgroundColor: '#059669',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Plus color="#fff" size={18} />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Agregar</Text>
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Store color="#d1d5db" size={40} />
              <Text style={{ color: '#9ca3af', marginTop: 12 }}>
                Tu vitrina está vacía. Agrega tu primer producto.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 14,
                marginBottom: 12,
                flexDirection: 'row',
                gap: 12,
                borderWidth: 1,
                borderColor: '#f3f4f6',
              }}
            >
              {item.imagenUrl ? (
                <Image
                  source={{ uri: item.imagenUrl }}
                  style={{ width: 64, height: 64, borderRadius: 14 }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 14,
                    backgroundColor: '#f3f4f6',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Package color="#9ca3af" size={26} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    style={{ fontWeight: '700', color: '#111827', fontSize: 15, flex: 1 }}
                    numberOfLines={1}
                  >
                    {item.nombre}
                  </Text>
                  {item.flash && (
                    <View
                      style={{
                        backgroundColor: '#fef3c7',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ color: '#d97706', fontWeight: '700', fontSize: 10 }}>
                        FLASH
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: '#6b7280', fontSize: 12 }}>
                  {item.categoria} · Stock: {item.stock}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#059669', marginTop: 4 }}>
                  {item.precio && item.precio > 0 ? `S/ ${item.precio}` : 'Consultar'}
                </Text>
              </View>
              <Pressable
                onPress={() => eliminarProducto(item)}
                style={{
                  alignSelf: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#fef2f2',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Trash2 color="#ef4444" size={18} />
              </Pressable>
            </View>
          )}
        />
      )}

      {/* Modal agregar producto */}
      <Modal
        visible={modalProducto}
        transparent
        animationType="slide"
        onRequestClose={() => setModalProducto(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'web' ? undefined : 'padding'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <ScrollView
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: '90%',
            }}
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
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
                Agregar producto
              </Text>
              <Pressable onPress={() => setModalProducto(false)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            <Text style={styles.label}>Foto real del producto (opcional)</Text>
            <Pressable
              onPress={seleccionarFotoProducto}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: '#f9fafb',
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: '#e5e7eb',
                marginTop: 6,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: pFotoUri ? '#d1fae5' : '#f3f4f6',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {pFotoUri ? (
                  <CheckCircle2 color="#059669" size={22} />
                ) : (
                  <Upload color="#6b7280" size={22} />
                )}
              </View>
              <Text style={{ flex: 1, color: '#374151', fontSize: 14 }}>
                {pFotoUri ? 'Foto seleccionada ✓' : 'Toca para elegir de tu galería'}
              </Text>
            </Pressable>

            {pFotoUri && (
              <View style={{ alignItems: 'center', marginTop: 12 }}>
                <Image
                  source={{ uri: pFotoUri }}
                  style={{ width: 90, height: 90, borderRadius: 14 }}
                  resizeMode="cover"
                />
              </View>
            )}

            <Text style={styles.label}>Nombre del producto</Text>
            <TextInput
              value={pNombre}
              onChangeText={setPNombre}
              placeholder="Ej: 1/2 Pollo a la Brasa / Arroz 5kg"
              style={styles.input}
            />

            <Text style={styles.label}>Descripción corta</Text>
            <TextInput
              value={pDesc}
              onChangeText={setPDesc}
              placeholder="Detalles, porción o marca..."
              multiline
              style={[styles.input, { minHeight: 50, textAlignVertical: 'top' }]}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Precio (S/)</Text>
                <TextInput
                  value={pPrecio}
                  onChangeText={setPPrecio}
                  placeholder="Ej: 24"
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Stock</Text>
                <TextInput
                  value={pStock}
                  onChangeText={setPStock}
                  placeholder="10"
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={styles.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {CATEGORIAS.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setPCategoria(cat)}
                  style={{
                    backgroundColor: pCategoria === cat ? '#059669' : '#fff',
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    marginRight: 8,
                    borderWidth: 1,
                    borderColor: pCategoria === cat ? '#059669' : '#e5e7eb',
                  }}
                >
                  <Text
                    style={{
                      fontWeight: '700',
                      fontSize: 13,
                      color: pCategoria === cat ? '#fff' : '#6b7280',
                    }}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={guardarProducto}
              disabled={guardando}
              style={{
                backgroundColor: guardando ? '#a7f3d0' : '#059669',
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                marginTop: 18,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {guardando ? 'Publicando...' : 'Publicar producto'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 10 },
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
});