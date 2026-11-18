import { useEffect, useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Send,
  XCircle,
  CheckCircle,
  DollarSign,
  AlertTriangle,
  Check,
  CheckCheck,
  MapPin,
  MessageSquare,
  Share2,
  ShieldCheck,
  Volume2,
  Mic,
  Star,
} from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import type { Usuario, Coordenada, ChatData, Mensaje } from '@/types';
import { MapaViaje } from '@/components/MapaZona';

const ZONA_DEFAULT = {
  latitude: -5.0561,
  longitude: -80.3472,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

function contieneNumeroOContacto(texto: string): boolean {
  const limpio = texto.toLowerCase();
  if (/\d{6,}/.test(limpio.replace(/[\s.-]/g, ''))) return true;
  if (/(wsp|whatsapp|llámame|llamame|celular|teléfono|telefono|http|wa\.me|t\.me)/i.test(limpio)) {
    return true;
  }
  const palabrasNumeros = limpio.match(
    /\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g
  );
  return Boolean(palabrasNumeros && palabrasNumeros.length >= 5);
}

function detenerVoz() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SpeechMod = require('expo-speech');
    SpeechMod?.stop?.();
  } catch {}
}

export default function ViajeChatScreen() {
  const { id } = useLocalSearchParams();
  const chatId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const user = useAuthStore((s) => s.user) as Usuario | null;

  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [pinOffline, setPinOffline] = useState<string>('');
  const [leyendoId, setLeyendoId] = useState<string | null>(null);

  const [vistaMapaCompleto, setVistaMapaCompleto] = useState(false);

  const [regionMapa, setRegionMapa] = useState(ZONA_DEFAULT);
  const [choferPos, setChoferPos] = useState<Coordenada | null>(null);
  const [origen, setOrigen] = useState<Coordenada | null>(null);
  const [destino, setDestino] = useState<Coordenada | null>(null);

  const [modalOferta, setModalOferta] = useState(false);
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [modalReporte, setModalReporte] = useState(false);
  const [motivoReporte, setMotivoReporte] = useState('');

  // Estados para Calificación Obligatoria
  const [modalCalificar, setModalCalificar] = useState(false);
  const [estrellas, setEstrellas] = useState(0);

  const flatListRef = useRef<FlatList<Mensaje>>(null);
  const inputRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const saliendoRef = useRef(false);

  const esChofer = user?.rol === 'chofer';

  useEffect(() => {
    mountedRef.current = true;
    saliendoRef.current = false;
    if (chatId) {
      AsyncStorage.getItem(`viaje_offline_${chatId}`).then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.pinSeguridad) setPinOffline(parsed.pinSeguridad);
          } catch {}
        }
      });
    }
    return () => {
      mountedRef.current = false;
      detenerVoz();
    };
  }, [chatId]);

  const leerMensajeEnVozAlta = (msg: Mensaje) => {
    detenerVoz();
    if (leyendoId === msg.id) {
      setLeyendoId(null);
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SpeechMod = require('expo-speech');
      setLeyendoId(msg.id);
      const limpio = msg.texto
        .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s.,:;!?¡¿/-]/g, '')
        .trim();
      SpeechMod.speak(limpio || msg.texto, {
        language: 'es-PE',
        rate: 0.95,
        onDone: () => mountedRef.current && setLeyendoId(null),
        onStopped: () => mountedRef.current && setLeyendoId(null),
        onError: () => mountedRef.current && setLeyendoId(null),
      });
    } catch {
      setLeyendoId(null);
      Alert.alert('Aviso', 'Lectura de voz no disponible en este dispositivo.');
    }
  };

  const activarDictadoPorVoz = () => {
    inputRef.current?.focus?.();
    Alert.alert(
      'Hablar para escribir',
      'Toca el ícono de micrófono 🎤 en tu teclado (arriba de las letras) y habla; tu voz se convertirá en texto filtrado automáticamente.'
    );
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!esChofer || !chatId) return;

    let interval: ReturnType<typeof setInterval>;

    (async () => {
      try {
        const LocationMod = await import('expo-location');
        const Location = (LocationMod as any).default || LocationMod;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const actualizarGps = async () => {
          if (saliendoRef.current) return;
          try {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (!mountedRef.current || saliendoRef.current) return;
            const coord = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            setChoferPos(coord);
            setRegionMapa({
              latitude: coord.latitude,
              longitude: coord.longitude,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015,
            });

            await updateDoc(doc(db, 'chats', chatId), {
              choferLat: coord.latitude,
              choferLng: coord.longitude,
            }).catch(() => {});
          } catch {}
        };

        actualizarGps();
        interval = setInterval(actualizarGps, 8000);
      } catch {}
    })();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [esChofer, chatId]);

  useEffect(() => {
    if (!chatId) return;
    setLoading(true);

    const docRef = doc(db, 'chats', chatId);
    const unsubChat = onSnapshot(
      docRef,
      (snap) => {
        if (!mountedRef.current) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          setChatData(data as ChatData);

          if (data.origenLat && data.origenLng) {
            setOrigen({ latitude: data.origenLat, longitude: data.origenLng });
          }
          if (data.destinoLat && data.destinoLng) {
            setDestino({ latitude: data.destinoLat, longitude: data.destinoLng });
          }
          if (data.choferLat && data.choferLng) {
            setChoferPos({ latitude: data.choferLat, longitude: data.choferLng });
          }

          if (data.estado === 'cancelado' && !saliendoRef.current) {
            saliendoRef.current = true;
            router.replace('/(tabs)');
            setTimeout(() => {
              Alert.alert('Viaje cancelado', 'La ruta fue cancelada y volviste al inicio.');
            }, 250);
          }
        }
        setLoading(false);
      },
      () => {
        if (!mountedRef.current) return;
        setLoading(false);
      }
    );
    return unsubChat;
  }, [chatId, router]);

  useEffect(() => {
    if (!chatId || !user) return;

    const q = query(
      collection(db, 'chats', chatId, 'mensajes'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        if (!mountedRef.current || saliendoRef.current) return;
        const lista: Mensaje[] = [];
        const updates: Promise<void>[] = [];

        snap.forEach((d) => {
          const data = d.data() as any;
          lista.push({ id: d.id, ...data } as Mensaje);

          if (data.senderUid !== user.uid && !data.leido) {
            updates.push(
              updateDoc(doc(db, 'chats', chatId, 'mensajes', d.id), {
                leido: true,
              }).catch(() => {})
            );
          }
        });

        await Promise.all(updates);
        if (!mountedRef.current || saliendoRef.current) return;
        setMensajes(lista);
      },
      () => {}
    );
    return unsub;
  }, [chatId, user]);

  const enviarMensaje = useCallback(
    async (customTexto?: string) => {
      const mensajeFinal = customTexto || texto;
      if (!user || !mensajeFinal.trim() || !chatId || enviando) return;

      if (contieneNumeroOContacto(mensajeFinal)) {
        Alert.alert(
          'Seguridad Rutas Express',
          'Por seguridad, no compartas números de teléfono ni enlaces. Coordina solo el punto de encuentro.'
        );
        return;
      }

      if (!customTexto) setTexto('');
      setEnviando(true);
      try {
        await addDoc(collection(db, 'chats', chatId, 'mensajes'), {
          senderUid: user.uid,
          senderNombre: user.nombre,
          texto: mensajeFinal.trim(),
          tipo: 'texto',
          leido: false,
          createdAt: serverTimestamp(),
        });
      } catch {
        if (mountedRef.current) {
          Alert.alert('Sin conexión', 'Revisa tu señal para enviar mensajes.');
        }
      } finally {
        if (mountedRef.current) setEnviando(false);
      }
    },
    [chatId, user, texto, enviando]
  );

  const marcarPasajeroRecogido = async () => {
    if (!chatId) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        clienteRecogido: true,
        recogidoEn: serverTimestamp(),
      });
      await enviarMensaje('🛵 Pasajero a bordo — Rumbo al destino');
      setVistaMapaCompleto(true);
    } catch {
      Alert.alert('Aviso', 'No se pudo actualizar el estado.');
    }
  };

  const compartirViajeWhatsApp = () => {
    const info = chatData as any;
    const msg =
      `🛡️ *Viaje seguro en Rutas Express*\n` +
      `Chofer: ${info?.choferNombre || 'Verificado'}\n` +
      `Placa: ${info?.choferPlaca || 'Verificada'} (${info?.choferModelo || 'Mototaxi'} ${info?.choferColor || ''})\n` +
      `Desde: ${info?.origen || 'Punto de recojo'}\n` +
      `Hacia: ${info?.destino || 'Destino'}\n` +
      `Tarifa: S/ ${info?.precioAcordado ?? info?.precio ?? ''}`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  const enviarContraoferta = async () => {
    if (!chatId || !nuevoPrecio || isNaN(Number(nuevoPrecio))) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        precioAcordado: Number(nuevoPrecio),
      });
      await enviarMensaje(`💰 Propongo ajustar la tarifa a: S/ ${nuevoPrecio}`);
      setModalOferta(false);
      setNuevoPrecio('');
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la tarifa.');
    }
  };

  const cancelarViaje = async () => {
    if (!chatId) return;
    Alert.alert('Cancelar viaje', '¿Seguro que deseas cancelar? El registro quedará guardado.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          saliendoRef.current = true;
          const solId = (chatData as any)?.solicitudId;
          try {
            await updateDoc(doc(db, 'chats', chatId), {
              estado: 'cancelado',
              canceladoPor: user?.uid || 'usuario',
              canceladoEn: serverTimestamp(),
            });

            if (solId) {
              if (esChofer) {
                await updateDoc(doc(db, 'solicitudes', solId), {
                  estado: 'abierta',
                  choferUid: null,
                  choferNombre: null,
                }).catch(() => {});
              } else {
                await updateDoc(doc(db, 'solicitudes', solId), {
                  estado: 'cancelada',
                  canceladoPor: user?.uid || 'cliente',
                  fechaCancelacion: serverTimestamp(),
                }).catch(() => {});
              }
            }
          } catch {}
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  // Abre el Modal Obligatorio de Calificación antes de finalizar
  const iniciarFinalizarViaje = () => {
    setModalCalificar(true);
  };

  // Ejecuta el final de viaje y envía calificación
  const confirmarFinalizarViaje = async () => {
    if (!chatId) return;
    saliendoRef.current = true;
    setModalCalificar(false);
    
    const monto = Number((chatData as any)?.precioAcordado ?? (chatData as any)?.precio ?? 0);
    const info = chatData as any;
    
    try {
      const chatRef = doc(db, 'chats', chatId);
      
      await Promise.race([
        updateDoc(chatRef, {
          estado: 'finalizado',
          finalizadoPor: user?.nombre || 'Usuario',
          finalizadoEn: serverTimestamp(),
          [`calificacion_${esChofer ? 'chofer' : 'cliente'}`]: estrellas,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('offline')), 3500)),
      ]);

      if (esChofer && user?.uid && monto > 0) {
        await updateDoc(doc(db, 'usuarios', user.uid), {
          gananciaHoy: increment(monto),
        }).catch(() => {});
      }

      // Si el chofer califica al pasajero, sumar estrellas al uid del cliente (o viceversa)
      const targetUid = esChofer ? info?.clienteUid : info?.choferUid;
      if (targetUid) {
        await updateDoc(doc(db, 'usuarios', targetUid), {
          calificacionTotal: increment(estrellas),
          calificacionVotos: increment(1),
        }).catch(() => {});
      }

      await addDoc(collection(chatRef, 'mensajes'), {
        tipo: 'sistema',
        texto: `🏁 Viaje completado y calificado con ${estrellas} estrellas • Chat cerrado`,
        createdAt: serverTimestamp(),
      });
      
      router.replace('/(tabs)');
    } catch {
      await AsyncStorage.setItem(
        `pendiente_cierre_${chatId}`,
        JSON.stringify({
          chatId,
          monto,
          choferUid: user?.uid,
          estrellas,
          targetUid: esChofer ? info?.clienteUid : info?.choferUid,
          finalizadoEn: Date.now(),
        })
      );
      Alert.alert(
        'Finalizado sin señal',
        'El cierre y la calificación quedaron guardados en tu teléfono. Se sincronizará al volver la cobertura.'
      );
      router.replace('/(tabs)');
    }
  };

  const enviarReporte = async () => {
    if (!chatId || !motivoReporte.trim() || !user || !chatData) return;
    try {
      const acusadoUid =
        user.uid === chatData.clienteUid ? chatData.choferUid : chatData.clienteUid;
      await addDoc(collection(db, 'reportes'), {
        viajeId: chatId,
        reportanteUid: user.uid,
        reportanteNombre: user.nombre,
        acusadoUid: acusadoUid || 'desconocido',
        motivo: motivoReporte.trim(),
        mensajesSnapshot: mensajes.slice(-15).map((m) => `${m.senderNombre}: ${m.texto}`),
        estado: 'pendiente',
        createdAt: serverTimestamp(),
      });
      setModalReporte(false);
      setMotivoReporte('');
      Alert.alert('Reporte enviado', 'El administrador revisará la evidencia del viaje.');
    } catch {
      Alert.alert('Error', 'No se pudo enviar el reporte.');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' }}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={{ color: '#fff', marginTop: 12 }}>Cargando viaje y GPS...</Text>
      </View>
    );
  }

  const nombreContraparte = esChofer ? chatData?.clienteNombre : chatData?.choferNombre;
  const info = chatData as any;
  const etapaActual: 'hacia_cliente' | 'hacia_destino' = info?.clienteRecogido
    ? 'hacia_destino'
    : 'hacia_cliente';
  const pinMostrar = info?.pinSeguridad || pinOffline || '----';

  const renderMensaje = ({ item }: { item: Mensaje }) => {
    if (item.tipo === 'sistema') {
      return (
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <View style={{ backgroundColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
            <Text style={{ fontSize: 12, color: '#4b5563', fontWeight: '600', textAlign: 'center' }}>
              {item.texto}
            </Text>
          </View>
        </View>
      );
    }
    const esMio = item.senderUid === user?.uid;
    const estaLeyendo = leyendoId === item.id;
    return (
      <View style={[styles.bubble, esMio ? styles.bubbleMio : styles.bubbleOtro]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: esMio ? '#d1fae5' : '#6b7280' }}>
            {item.senderNombre}
          </Text>
          <Pressable
            onPress={() => leerMensajeEnVozAlta(item)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              backgroundColor: esMio ? 'rgba(255,255,255,0.2)' : '#e5e7eb',
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 10,
            }}
          >
            <Volume2 color={esMio ? '#fff' : '#059669'} size={13} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: esMio ? '#fff' : '#059669' }}>
              {estaLeyendo ? 'Leyendo...' : 'Escuchar'}
            </Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 14, color: esMio ? '#fff' : '#111827' }}>{item.texto}</Text>
        {esMio && (
          <View style={{ alignSelf: 'flex-end', marginTop: 2, flexDirection: 'row', alignItems: 'center' }}>
            {item.leido ? <CheckCheck color="#93c5fd" size={13} /> : <Check color="#d1fae5" size={13} />}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#111827' }}>
      {/* Header con info del viaje */}
      <View style={styles.topNavCard}>
        <Pressable onPress={() => router.replace('/(tabs)' as any)} style={styles.backBtn}>
          <ArrowLeft color="#111827" size={18} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }} numberOfLines={1}>
            {nombreContraparte}
          </Text>
          <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700' }} numberOfLines={1}>
            Destino: {chatData?.destino} · S/ {info?.precioAcordado ?? info?.precio ?? ''}
          </Text>
        </View>
        <Pressable onPress={() => setModalReporte(true)} style={styles.reportBtn}>
          <AlertTriangle color="#ef4444" size={16} />
        </Pressable>
      </View>

      {/* Ficha de seguridad */}
      <View style={styles.securityBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <ShieldCheck color="#059669" size={18} />
          <View>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#111827' }}>
              Placa: {info?.choferPlaca || 'Verificada'} · PIN: {pinMostrar}
            </Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>
              {etapaActual === 'hacia_cliente'
                ? 'Etapa 1: Chofer yendo al punto de recojo'
                : 'Etapa 2: Pasajero a bordo rumbo al destino'}
            </Text>
          </View>
        </View>
        {!esChofer && (
          <Pressable onPress={compartirViajeWhatsApp} style={styles.shareBtn}>
            <Share2 color="#fff" size={13} />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Compartir</Text>
          </Pressable>
        )}
      </View>

      {/* Pestañas superiores */}
      <View style={styles.tabsBar}>
        <Pressable
          onPress={() => setVistaMapaCompleto(false)}
          style={[styles.tab, !vistaMapaCompleto && styles.tabActivo]}
        >
          <MessageSquare color={!vistaMapaCompleto ? '#fff' : '#9ca3af'} size={16} />
          <Text style={[styles.tabText, !vistaMapaCompleto && styles.tabTextActivo]}>
            Mensajes
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setVistaMapaCompleto(true)}
          style={[styles.tab, vistaMapaCompleto && styles.tabActivo]}
        >
          <MapPin color={vistaMapaCompleto ? '#fff' : '#9ca3af'} size={16} />
          <Text style={[styles.tabText, vistaMapaCompleto && styles.tabTextActivo]}>
            Mapa ({etapaActual === 'hacia_cliente' ? 'Al cliente' : 'Al destino'})
          </Text>
        </Pressable>
      </View>

      {/* Pestaña Mensajes */}
      {!vistaMapaCompleto && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomPanel}
        >
          <View style={styles.actionsRow}>
            {esChofer && etapaActual === 'hacia_cliente' ? (
              <Pressable onPress={marcarPasajeroRecogido} style={styles.btnPrimary}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>
                  Ya recogí al pasajero
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => enviarMensaje('📍 ¡Ya estoy aquí en el punto de encuentro!')}
                style={styles.btnPrimary}
                disabled={enviando}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Ya estoy aquí</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setModalOferta(true)} style={styles.btnOffer}>
              <DollarSign color="#d97706" size={13} />
              <Text style={{ color: '#d97706', fontWeight: '800', fontSize: 11 }}>Tarifa</Text>
            </Pressable>
            <Pressable onPress={cancelarViaje} style={styles.btnDanger}>
              <XCircle color="#dc2626" size={13} />
              <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 10 }}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={iniciarFinalizarViaje} style={styles.btnSuccess}>
              <CheckCircle color="#fff" size={13} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 10 }}>Finalizar</Text>
            </Pressable>
          </View>

          <FlatList
            ref={flatListRef}
            data={mensajes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            renderItem={renderMensaje}
            onContentSizeChange={() => {
              if (mensajes.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
          />

          {chatData?.estado !== 'finalizado' && chatData?.estado !== 'cancelado' && (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.quickScroll}
              >
                {[
                  '📍 Ya voy en camino',
                  '🚪 Estoy afuera esperando',
                  '⏳ Salgo en 1 minuto',
                  '🏡 Estoy en la esquina / referencia',
                ].map((t, idx) => (
                  <Pressable key={idx} onPress={() => enviarMensaje(t)} style={styles.quickChip}>
                    <Text style={{ color: '#047857', fontSize: 11, fontWeight: '700' }}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.inputRow}>
                <Pressable onPress={activarDictadoPorVoz} style={styles.dictadoBtn}>
                  <Mic color="#059669" size={19} />
                </Pressable>

                <TextInput
                  ref={inputRef}
                  value={texto}
                  onChangeText={setTexto}
                  placeholder="Escribe o usa el micrófono del teclado..."
                  placeholderTextColor="#9ca3af"
                  style={styles.textInput}
                />

                <Pressable onPress={() => enviarMensaje()} style={styles.sendBtn} disabled={enviando}>
                  <Send color="#fff" size={18} />
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      )}

      {/* Pestaña Mapa: 2 etapas con ruta real por carretera */}
      {vistaMapaCompleto && (
        <View style={{ flex: 1, position: 'relative' }}>
          <MapaViaje
            region={regionMapa}
            origen={origen}
            destino={destino}
            choferPos={choferPos}
            etapa={etapaActual}
          />
          <View style={styles.mapaInfoOverlay}>
            <View style={{ width: '100%', alignItems: 'center', gap: 4 }}>
              <Text style={styles.mapaInfoText}>
                Recoger en: {info?.origen || 'Punto GPS'}
                {info?.referencia ? ` (${info.referencia})` : ''}
              </Text>
              <Text style={styles.mapaInfoText}>
                Destino: {chatData?.destino} · S/ {info?.precioAcordado ?? info?.precio ?? ''}
              </Text>
            </View>
            {esChofer && etapaActual === 'hacia_cliente' && (
              <Pressable
                onPress={marcarPasajeroRecogido}
                style={{
                  backgroundColor: '#059669',
                  paddingHorizontal: 20,
                  paddingVertical: 11,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  Ya recogí al pasajero — Ver ruta a destino
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Modal Contraoferta */}
      <Modal visible={modalOferta} transparent animationType="fade" onRequestClose={() => setModalOferta(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 6 }}>Nueva Tarifa (S/)</Text>
            <TextInput
              value={nuevoPrecio}
              onChangeText={setNuevoPrecio}
              placeholder="Ej: 9"
              keyboardType="numeric"
              style={styles.modalInput}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setModalOferta(false)} style={styles.btnCancel}>
                <Text style={{ fontWeight: '700', color: '#6b7280' }}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={enviarContraoferta} style={styles.btnConfirm}>
                <Text style={{ fontWeight: '700', color: '#fff' }}>Actualizar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Reporte */}
      <Modal visible={modalReporte} transparent animationType="fade" onRequestClose={() => setModalReporte(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#ef4444', marginBottom: 6 }}>Reportar Incidencia</Text>
            <TextInput
              value={motivoReporte}
              onChangeText={setMotivoReporte}
              placeholder="Describe el motivo (se guardará copia del chat)..."
              multiline
              style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setModalReporte(false)} style={styles.btnCancel}>
                <Text style={{ fontWeight: '700', color: '#6b7280' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={enviarReporte}
                style={{ flex: 1, paddingVertical: 12, backgroundColor: '#ef4444', borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>Denunciar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Obligatorio para Calificar de 1 a 5 estrellas al Finalizar */}
      <Modal visible={modalCalificar} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 }}>
              Califica tu viaje
            </Text>
            <Text style={{ fontSize: 14, color: '#4b5563', textAlign: 'center', marginBottom: 20 }}>
              ¿Qué tal fue la atención de {nombreContraparte}? Tu calificación es anónima.
            </Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              {[1, 2, 3, 4, 5].map((num) => (
                <Pressable key={num} onPress={() => setEstrellas(num)}>
                  <Star
                    color={estrellas >= num ? '#f59e0b' : '#d1d5db'}
                    size={36}
                    fill={estrellas >= num ? '#f59e0b' : 'transparent'}
                  />
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={confirmarFinalizarViaje}
              disabled={estrellas === 0}
              style={{
                backgroundColor: estrellas > 0 ? '#059669' : '#d1fae5',
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: estrellas > 0 ? '#fff' : '#059669', fontWeight: '800', fontSize: 15 }}>
                Confirmar y Cerrar
              </Text>
            </Pressable>
            
            <Pressable onPress={() => setModalCalificar(false)} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: '#6b7280', fontWeight: '700' }}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  topNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  securityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#d1fae5',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  tabsBar: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  tabActivo: { backgroundColor: '#059669' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  tabTextActivo: { color: '#fff' },
  bottomPanel: {
    flex: 1,
    backgroundColor: '#fff',
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 8,
    marginBottom: 6,
    gap: 4,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  btnPrimary: { backgroundColor: '#059669', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center' },
  btnOffer: { backgroundColor: '#fef3c7', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#fde68a' },
  btnDanger: { backgroundColor: '#fee2e2', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#fca5a5' },
  btnSuccess: { backgroundColor: '#059669', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 2 },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 14, marginBottom: 6 },
  bubbleMio: { alignSelf: 'flex-end', backgroundColor: '#059669' },
  bubbleOtro: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6' },
  quickScroll: { paddingHorizontal: 12, maxHeight: 32, marginBottom: 4 },
  quickChip: { backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginRight: 6, height: 26 },
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  dictadoBtn: {
    backgroundColor: '#d1fae5',
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 14,
    color: '#111827',
  },
  sendBtn: {
    backgroundColor: '#059669',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#111827',
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    alignItems: 'center',
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#059669',
    borderRadius: 12,
    alignItems: 'center',
  },
  mapaInfoOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    elevation: 4,
  },
  mapaInfoText: {
    fontSize: 13,
    color: '#111827',
    textAlign: 'center',
    fontWeight: '700',
  },
});