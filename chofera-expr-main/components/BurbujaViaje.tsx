import { useEffect, useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { MessageCircle } from 'lucide-react-native';
import { db, auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/useAuthStore';

export function BurbujaViaje() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user) as any;
  const uid = user?.uid || auth.currentUser?.uid;
  const esChofer = user?.rol === 'chofer';

  const [viajeActivo, setViajeActivo] = useState<{
    id: string;
    contraparte: string;
    destino: string;
    precio: number;
  } | null>(null);
  const [sinLeer, setSinLeer] = useState(0);

  useEffect(() => {
    if (!uid) return;
    const campo = esChofer ? 'choferUid' : 'clienteUid';
    const q = query(
      collection(db, 'chats'),
      where(campo, '==', uid),
      where('estado', '==', 'en_curso')
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setViajeActivo(null);
        setSinLeer(0);
        return;
      }
      const d = snap.docs[0];
      const data = d.data() as any;
      setViajeActivo({
        id: d.id,
        contraparte: esChofer
          ? data.clienteNombre || 'Pasajero'
          : data.choferNombre || 'Chofer',
        destino: data.destino || 'Destino',
        precio: data.precioAcordado ?? data.precio ?? 0,
      });
    });

    return () => unsub();
  }, [uid, esChofer]);

  useEffect(() => {
    if (!viajeActivo?.id || !uid) return;
    const q = query(
      collection(db, 'chats', viajeActivo.id, 'mensajes'),
      where('leido', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      snap.forEach((docMsg) => {
        const m = docMsg.data() as any;
        if (m.senderUid && m.senderUid !== uid) count++;
      });
      setSinLeer(count);
    });
    return () => unsub();
  }, [viajeActivo?.id, uid]);

  if (!viajeActivo) return null;

  return (
    <Pressable
      onPress={() => router.push(`/viaje/${viajeActivo.id}` as any)}
      style={styles.burbuja}
    >
      <View style={styles.iconoWrap}>
        <MessageCircle color="#fff" size={22} />
        {sinLeer > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{sinLeer}</Text>
          </View>
        )}
      </View>
      <View style={{ maxWidth: 165 }}>
        <Text style={styles.titulo} numberOfLines={1}>
          🛵 Viaje en curso · S/ {viajeActivo.precio}
        </Text>
        <Text style={styles.subtitulo} numberOfLines={1}>
          {sinLeer > 0
            ? `¡${sinLeer} mensaje(s) nuevo(s)! Toca aquí`
            : `Volver al chat con ${viajeActivo.contraparte}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  burbuja: {
    position: 'absolute',
    bottom: 76,
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
  iconoWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
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
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  titulo: { color: '#fff', fontSize: 12, fontWeight: '800' },
  subtitulo: { color: '#d1fae5', fontSize: 11, fontWeight: '600' },
});