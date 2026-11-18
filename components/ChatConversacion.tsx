import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Send,
  Mic,
  Check,
  CheckCheck,
  Camera,
  X,
  MessageSquare,
  MapPin,
  AlertTriangle,
  Play,
  Pause,
  Trash2,
} from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { subirImagenStorage } from '@/lib/storage';
import { useAuthStore } from '@/store/useAuthStore';
import { useAudio } from '@/hooks/useAudio';
import type { Usuario, Coordenada, Mensaje } from '@/types';
import { MapaViaje } from '@/components/MapaZona';

export type ChatTipo = 'mural' | 'tienda' | 'viaje';

interface ChatConversacionProps {
  chatId: string;
  chatCollection: 'chats_mural' | 'chats_tienda' | 'chats';
  tipo: ChatTipo;
  titulo: string;
  subtitulo: string;
  origen?: Coordenada | null;
  destino?: Coordenada | null;
  mostrarMapa?: boolean;
}

const ZONA_DEFAULT = {
  latitude: -5.059,
  longitude: -80.35,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export function ChatConversacion({
  chatId,
  chatCollection,
  tipo,
  titulo,
  subtitulo,
  origen,
  destino,
  mostrarMapa = true,
}: ChatConversacionProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user) as Usuario | null;

  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviandoImagen, setEnviandoImagen] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [pestaActiva, setPestanaActiva] = useState<'mensajes' | 'mapa'>('mensajes');
  const [modalImagen, setModalImagen] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<Mensaje>>(null);
  const mountedRef = useRef(true);

  const audio = useAudio();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audio.limpiarRecursos();
    };
  }, []);

  useEffect(() => {
    if (audio.errorAudio) {
      Alert.alert('Audio', audio.errorAudio);
    }
  }, [audio.errorAudio]);

  useEffect(() => {
    if (!chatId || !user) return;

    const q = query(
      collection(db, chatCollection, chatId, 'mensajes'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        if (!mountedRef.current) return;
        const lista: Mensaje[] = [];
        const updates: Promise<void>[] = [];

        snap.forEach((d) => {
          const data = d.data() as any;
          lista.push({ id: d.id, ...data } as Mensaje);

          if (data.senderUid !== user.uid && !data.leido) {
            updates.push(
              updateDoc(doc(db, chatCollection, chatId, 'mensajes', d.id), {
                leido: true,
              }).catch(() => {})
            );
          }
        });

        await Promise.all(updates);
        if (!mountedRef.current) return;
        setMensajes(lista);
        setLoading(false);
      },
      (err) => {
        if (!mountedRef.current) return;
        setErrorCarga('No se pudieron cargar los mensajes.');
        setLoading(false);
      }
    );
    return unsub;
  }, [chatId, user, chatCollection]);

  const enviarMensaje = useCallback(
    async (customTexto?: string, tipo: 'texto' | 'audio' | 'imagen' = 'texto', audioUrl?: string) => {
      const mensajeFinal = customTexto || texto;
      if (!user || (!mensajeFinal.trim() && tipo === 'texto') || !chatId || enviando) return;

      if (tipo === 'texto' && !customTexto) setTexto('');
      setEnviando(true);
      try {
        const payload: Record<string, any> = {
          senderUid: user.uid,
          senderNombre: user.nombre,
          texto: tipo === 'audio' ? '🎤 [Nota de voz]' : mensajeFinal.trim(),
          tipo,
          leido: false,
          createdAt: serverTimestamp(),
        };
        if (tipo === 'audio' && audioUrl) {
          payload.audioUrl = audioUrl;
        }
        await addDoc(collection(db, chatCollection, chatId, 'mensajes'), payload);
      } catch (e: any) {
        if (mountedRef.current) {
          Alert.alert('Error', 'No se pudo enviar el mensaje. Revisa tu conexión.');
        }
      } finally {
        if (mountedRef.current) setEnviando(false);
      }
    },
    [user, chatId, enviando, texto, chatCollection]
  );

  const enviarImagen = async () => {
    if (!user || !chatId || enviandoImagen) return;
    setEnviandoImagen(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.3,
      });

      if (result.canceled || !result.assets[0].uri) {
        setEnviandoImagen(false);
        return;
      }

      const imageUrl = await subirImagenStorage(
        result.assets[0].uri,
        `${chatCollection}/${chatId}/${Date.now()}.jpg`
      );

      await addDoc(collection(db, chatCollection, chatId, 'mensajes'), {
        senderUid: user.uid,
        senderNombre: user.nombre,
        texto: '📷 [Imagen]',
        tipo: 'imagen',
        imageUrl,
        leido: false,
        createdAt: serverTimestamp(),
      });
    } catch (e: any) {
      if (mountedRef.current) {
        Alert.alert('Error', e?.message ?? 'No se pudo subir la imagen.');
      }
    } finally {
      if (mountedRef.current) setEnviandoImagen(false);
    }
  };

  const manejarMic = async () => {
    if (audio.estadoGrabacion === 'inactivo') {
      await audio.iniciarGrabacion();
    } else if (audio.estadoGrabacion === 'grabando') {
      const audioUrl = await audio.detenerGrabacion();
      if (audioUrl) {
        await enviarMensaje(undefined, 'audio', audioUrl);
      }
    }
  };

  const cancelarGrabacion = async () => {
    await audio.cancelarGrabacion();
  };

  const renderMensaje = ({ item }: { item: Mensaje }) => {
    const esMio = item.senderUid === user?.uid;
    const esAudio = item.tipo === 'audio';
    const estaReproduciendo = audio.reproduciendoId === item.id;

    return (
      <View style={[styles.bubble, esMio ? styles.bubbleMio : styles.bubbleOtro]}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: esMio ? '#d1fae5' : '#6b7280' }}>
          {item.senderNombre}
        </Text>

        {item.tipo === 'imagen' && item.imageUrl ? (
          <Pressable onPress={() => setModalImagen(item.imageUrl!)}>
            <Image
              source={{ uri: item.imageUrl }}
              style={{ width: 200, height: 150, borderRadius: 10, marginTop: 4 }}
              resizeMode="cover"
            />
          </Pressable>
        ) : esAudio && item.audioUrl ? (
          <Pressable
            onPress={() => audio.reproducirAudio(item.audioUrl!, item.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}
          >
            <View style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: esMio ? 'rgba(255,255,255,0.25)' : '#059669',
              justifyContent: 'center', alignItems: 'center',
            }}>
              {estaReproduciendo ? (
                <Pause color="#fff" size={16} />
              ) : (
                <Play color="#fff" size={16} fill="#fff" />
              )}
            </View>
            <Text style={{ fontSize: 13, color: esMio ? '#fff' : '#111827' }}>
              {estaReproduciendo ? 'Reproduciendo...' : 'Nota de voz'}
            </Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 13, color: esMio ? '#fff' : '#111827' }}>{item.texto}</Text>
        )}

        {esMio && (
          <View style={{ alignSelf: 'flex-end', marginTop: 2, flexDirection: 'row', alignItems: 'center' }}>
            {item.leido ? <CheckCheck color="#d1fae5" size={13} /> : <Check color="#d1fae5" size={13} />}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={{ color: '#fff', marginTop: 12 }}>Cargando conversación...</Text>
      </View>
    );
  }

  if (errorCarga && mensajes.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <AlertTriangle color="#fbbf24" size={40} />
        <Text style={{ color: '#fff', marginTop: 12, textAlign: 'center' }}>{errorCarga}</Text>
        <Pressable onPress={() => router.back()} style={styles.errorBtn}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const mensajesRapidos = [
    '📍 Estoy aquí',
    '👍 ¡Trato hecho!',
    '⏳ Un momento por favor',
    '❓ ¿Aún disponible?',
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#111827' }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#111827" size={18} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }} numberOfLines={1}>
            {titulo}
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }} numberOfLines={1}>
            {subtitulo}
          </Text>
        </View>
      </View>

      {/* Pestañas */}
      {mostrarMapa && (
        <View style={styles.tabsBar}>
          <Pressable
            onPress={() => setPestanaActiva('mensajes')}
            style={[styles.tab, pestaActiva === 'mensajes' && styles.tabActivo]}
          >
            <MessageSquare color={pestaActiva === 'mensajes' ? '#fff' : '#6b7280'} size={16} />
            <Text style={[styles.tabText, pestaActiva === 'mensajes' && styles.tabTextActivo]}>
              Mensajes
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPestanaActiva('mapa')}
            style={[styles.tab, pestaActiva === 'mapa' && styles.tabActivo]}
          >
            <MapPin color={pestaActiva === 'mapa' ? '#fff' : '#6b7280'} size={16} />
            <Text style={[styles.tabText, pestaActiva === 'mapa' && styles.tabTextActivo]}>
              Mapa
            </Text>
          </Pressable>
        </View>
      )}

      {/* Contenido: Mensajes */}
      {pestaActiva === 'mensajes' || !mostrarMapa ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomPanel}
        >
          <FlatList
            ref={flatListRef}
            data={mensajes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
            style={{ flex: 1 }}
            renderItem={renderMensaje}
            onContentSizeChange={() => {
              if (mensajes.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
          />

          {/* Indicador de grabación */}
          {audio.estadoGrabacion === 'grabando' && (
            <View style={styles.grabacionBar}>
              <View style={styles.grabacionDot} />
              <Text style={styles.grabacionTexto}>
                Grabando... {Math.floor(audio.duracionSeg / 60)}:{String(audio.duracionSeg % 60).padStart(2, '0')}
              </Text>
              <Pressable onPress={cancelarGrabacion} style={styles.cancelarBtn}>
                <Trash2 color="#fff" size={16} />
              </Pressable>
            </View>
          )}

          {audio.estadoGrabacion === 'procesando' && (
            <View style={styles.grabacionBar}>
              <ActivityIndicator color="#fff" size={16} />
              <Text style={styles.grabacionTexto}>Procesando audio...</Text>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
            {mensajesRapidos.map((t, idx) => (
              <Pressable key={idx} onPress={() => setTexto(t)} style={styles.quickChip}>
                <Text style={{ color: '#047857', fontSize: 11, fontWeight: '600' }}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.inputRow}>
            <Pressable onPress={enviarImagen} disabled={enviandoImagen} style={styles.cameraBtn}>
              {enviandoImagen ? <ActivityIndicator color="#fff" size={18} /> : <Camera color="#fff" size={20} />}
            </Pressable>

            <Pressable
              onPress={manejarMic}
              style={[
                styles.micBtn,
                audio.estadoGrabacion === 'grabando' && styles.micBtnGrabando,
              ]}
            >
              {audio.estadoGrabacion === 'procesando' ? (
                <ActivityIndicator color="#fff" size={20} />
              ) : (
                <Mic color="#fff" size={20} />
              )}
            </Pressable>

            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#9ca3af"
              style={styles.textInput}
            />

            <Pressable onPress={() => enviarMensaje()} style={styles.sendBtn} disabled={enviando}>
              <Send color="#fff" size={18} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        /* Contenido: Mapa */
        <View style={{ flex: 1, position: 'relative' }}>
          <MapaViaje region={ZONA_DEFAULT} origen={origen} destino={destino} />
          {!origen && !destino && (
            <View style={styles.mapaInfo}>
              <MapPin color="#059669" size={28} />
              <Text style={styles.mapaInfoText}>
                {tipo === 'mural' ? 'Ubicación del vendedor disponible al confirmar' : 'Sin ubicación fijada'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Visor de imagen */}
      <Modal visible={!!modalImagen} transparent animationType="fade" onRequestClose={() => setModalImagen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <Pressable onPress={() => setModalImagen(null)} style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }}>
            <X color="#fff" size={28} />
          </Pressable>
          {modalImagen && (
            <Image source={{ uri: modalImagen }} style={{ width: '90%', height: '70%' }} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#111827', padding: 24,
  },
  errorBtn: {
    marginTop: 16, backgroundColor: '#059669',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingTop: 50, paddingHorizontal: 12,
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center',
  },
  tabsBar: {
    flexDirection: 'row', backgroundColor: '#1f2937',
    paddingHorizontal: 12, paddingVertical: 6, gap: 8,
  },
  tab: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'transparent',
  },
  tabActivo: { backgroundColor: '#059669' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  tabTextActivo: { color: '#fff' },
  bottomPanel: {
    flex: 1, backgroundColor: '#fff',
  },
  bubble: { maxWidth: '75%', padding: 8, borderRadius: 12, marginBottom: 4 },
  bubbleMio: { alignSelf: 'flex-end', backgroundColor: '#059669' },
  bubbleOtro: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6' },
  grabacionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 8,
    marginHorizontal: 12, borderRadius: 12, marginBottom: 4,
  },
  grabacionDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff',
  },
  grabacionTexto: {
    flex: 1, color: '#fff', fontWeight: '700', fontSize: 13,
  },
  cancelarBtn: {
    padding: 4,
  },
  quickScroll: { paddingHorizontal: 12, maxHeight: 30, marginVertical: 4 },
  quickChip: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 6, height: 24 },
  inputRow: {
    flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10,
    gap: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6',
    alignItems: 'center', backgroundColor: '#fff',
  },
  cameraBtn: {
    backgroundColor: '#0284c7', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  micBtn: {
    backgroundColor: '#059669', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  micBtnGrabando: {
    backgroundColor: '#ef4444',
  },
  textInput: {
    flex: 1, backgroundColor: '#f9fafb', borderRadius: 22,
    paddingHorizontal: 16, height: 44, borderWidth: 1, borderColor: '#e5e7eb',
    fontSize: 14, color: '#111827',
  },
  sendBtn: {
    backgroundColor: '#059669', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  mapaInfo: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, padding: 16,
    alignItems: 'center', gap: 8,
  },
  mapaInfoText: {
    fontSize: 13, color: '#374151', textAlign: 'center', fontWeight: '600',
  },
});
