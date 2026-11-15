import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  Store,
  Package,
  MessageCircle,
  MapPin,
  ShieldCheck,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import type { CategoriaTienda, Usuario } from '@/types';

interface Producto {
  id: string;
  tiendaUid: string;
  tiendaNombre: string;
  nombre: string;
  descripcion: string;
  precio?: number | null;
  stock: number;
  flash: boolean;
  categoria: CategoriaTienda;
  imagenUrl?: string;
  createdAt: any;
}

interface InfoTienda {
  nombreTienda?: string;
  categoriaTienda?: string;
  direccionTienda?: string;
  referenciaTienda?: string;
  tiendaAbierta?: boolean;
  plan?: string;
  nombre?: string;
}

const tienePrecio = (p: Producto) => p.precio != null && p.precio > 0;

function getBadgePlan(plan?: string) {
  const p = (plan || 'plata').toLowerCase();
  if (p === 'premium') return '💎 Tienda Premium';
  if (p === 'oro') return '🥇 Tienda Oro';
  if (p === 'platino') return '💠 Verificada';
  return '🥈 Comercio Local';
}

export default function StoreProfileScreen() {
  const { vendedorId } = useLocalSearchParams<{ vendedorId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user) as Usuario | null;
  const uid = user?.uid || auth.currentUser?.uid;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [info, setInfo] = useState<InfoTienda | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vendedorId) return;

    const unsubProd = onSnapshot(
      query(
        collection(db, 'productos'),
        where('tiendaUid', '==', vendedorId),
        where('activo', '!=', false)
      ),
      (snap) => {
        const lista: Producto[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          if (data.nombre) lista.push({ id: d.id, ...data });
        });
        lista.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setProductos(lista);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubInfo = onSnapshot(doc(db, 'usuarios', vendedorId), (snap) => {
      if (snap.exists()) setInfo(snap.data() as InfoTienda);
    });

    return () => {
      unsubProd();
      unsubInfo();
    };
  }, [vendedorId]);

  const localAbierto = info?.tiendaAbierta !== false;

  const contactarTienda = async (productoNombre?: string) => {
    if (!uid || !vendedorId || uid === vendedorId) return;

    try {
      const qExist = query(
        collection(db, 'chats_tienda'),
        where('tiendaUid', '==', vendedorId),
        where('clienteUid', '==', uid)
      );
      const snap = await getDocs(qExist);
      if (!snap.empty) {
        router.push(`/chat/tienda/${snap.docs[0].id}` as any);
        return;
      }
      const chatRef = await addDoc(collection(db, 'chats_tienda'), {
        productoNombre: productoNombre || 'Consulta general',
        tiendaUid: vendedorId,
        tiendaNombre: info?.nombreTienda ?? info?.nombre ?? 'Tienda',
        clienteUid: uid,
        clienteNombre: user?.nombre ?? 'Cliente',
        estado: 'activo',
        createdAt: serverTimestamp(),
      });
      router.push(`/chat/tienda/${chatRef.id}` as any);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el chat con la tienda.');
    }
  };

  const renderCard = ({ item }: { item: Producto }) => (
    <View style={[styles.gridCard, !localAbierto && { opacity: 0.72, backgroundColor: '#f3f4f6' }]}>
      {item.imagenUrl ? (
        <Image source={{ uri: item.imagenUrl }} style={styles.cardImg} resizeMode="cover" />
      ) : (
        <View style={styles.cardImgPlaceholder}>
          <Package color="#9ca3af" size={26} />
        </View>
      )}
      <Text style={styles.cardNombre} numberOfLines={2}>{item.nombre}</Text>
      {item.descripcion ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{item.descripcion}</Text>
      ) : null}
      <View style={styles.cardPrecioRow}>
        {tienePrecio(item) ? (
          <Text style={styles.cardPrecio}>S/ {item.precio}</Text>
        ) : (
          <Text style={styles.cardConsultar}>Consultar</Text>
        )}
        <Text style={styles.cardStock}>Stk: {item.stock}</Text>
      </View>

      {uid && uid !== vendedorId && (
        <Pressable
          onPress={() => contactarTienda(item.nombre)}
          style={[styles.btnPedirCard, !localAbierto && { backgroundColor: '#9ca3af' }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
            {localAbierto ? 'Consultar / Pedir' : 'Local Cerrado'}
          </Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft color="#111827" size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>Perfil de Tienda</Text>
      </View>

      <FlatList
        data={productos}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 14 }}
        ListHeaderComponent={
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Store color="#059669" size={32} />
            </View>

            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: localAbierto ? '#d1fae5' : '#fee2e2',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: localAbierto ? '#065f46' : '#991b1b',
                  }}
                >
                  {localAbierto ? '🟢 ABIERTO AHORA' : '🔴 CERRADO'}
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: '#fef3c7',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#92400e' }}>
                  {getBadgePlan(info?.plan)}
                </Text>
              </View>
            </View>

            <Text style={styles.nombreTienda}>
              {info?.nombreTienda ?? info?.nombre ?? 'Tienda'}
            </Text>

            {info?.referenciaTienda || info?.direccionTienda ? (
              <View style={styles.infoRow}>
                <MapPin color="#059669" size={15} />
                <Text style={styles.infoText}>
                  {info.referenciaTienda || info.direccionTienda}
                </Text>
              </View>
            ) : null}

            <View style={styles.infoRow}>
              <ShieldCheck color="#059669" size={15} />
              <Text style={{ color: '#065f46', fontSize: 12, fontWeight: '700' }}>
                Coordinación segura por chat interno
              </Text>
            </View>

            <Text style={styles.productosCount}>
              {productos.length} producto{productos.length === 1 ? '' : 's'} en catálogo
            </Text>

            {uid && uid !== vendedorId && (
              <Pressable onPress={() => contactarTienda()} style={styles.btnContactar}>
                <MessageCircle color="#fff" size={18} />
                <Text style={styles.btnContactarTxt}>Chatear con la tienda</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#059669" style={{ marginTop: 40 }} />
          ) : (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Package color="#d1d5db" size={40} />
              <Text style={{ color: '#9ca3af', marginTop: 12 }}>
                Esta tienda aún no tiene productos.
              </Text>
            </View>
          )
        }
        renderItem={renderCard}
      />
    </View>
  );
}

const styles = {
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
  } as any,
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  } as any,
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  } as any,
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#d1fae5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  } as any,
  nombreTienda: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  } as any,
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  } as any,
  infoText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '600',
  } as any,
  productosCount: {
    color: '#059669',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 12,
  } as any,
  btnContactar: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  } as any,
  btnContactarTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  } as any,
  gridCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  } as any,
  cardImg: {
    width: '100%',
    height: 90,
    borderRadius: 12,
    marginBottom: 8,
  } as any,
  cardImgPlaceholder: {
    width: '100%',
    height: 90,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  } as any,
  cardNombre: {
    fontWeight: '700',
    color: '#111827',
    fontSize: 14,
    minHeight: 36,
  } as any,
  cardDesc: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  } as any,
  cardPrecioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  } as any,
  cardPrecio: {
    fontSize: 17,
    fontWeight: '800',
    color: '#059669',
  } as any,
  cardConsultar: {
    fontSize: 14,
    fontWeight: '700',
    color: '#d97706',
  } as any,
  cardStock: {
    color: '#9ca3af',
    fontSize: 11,
  } as any,
  btnPedirCard: {
    marginTop: 8,
    backgroundColor: '#059669',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  } as any,
};