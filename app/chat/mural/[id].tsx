import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ChatConversacion } from '@/components/ChatConversacion';

export default function MuralChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [chatData, setChatData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, 'chats_mural', id),
      (snap) => {
        if (snap.exists()) {
          setChatData(snap.data());
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [id]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={{ color: '#fff', marginTop: 12 }}>Cargando chat del mural...</Text>
      </View>
    );
  }

  if (!chatData) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: '#fff' }}>Esta conversación ya no está disponible.</Text>
      </View>
    );
  }

  return (
    <ChatConversacion
      chatId={id}
      chatCollection="chats_mural"
      tipo="mural"
      titulo={chatData.vendedorNombre ?? 'Vendedor'}
      subtitulo={`Pedido: ${chatData.descripcion ?? ''}`}
      mostrarMapa={false}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827',
  },
});
