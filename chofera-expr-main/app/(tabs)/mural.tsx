import { useEffect, useState } from 'react';
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
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import {
  LayoutGrid,
  X,
  CheckCircle2,
  Briefcase,
  Megaphone,
  Search,
  Camera,
  ShieldAlert,
  MessageCircle,
  Send,
  Trash2,
  Users,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from '@/lib/firebase';
import { subirImagenStorage } from '@/lib/storage';
import { useAuthStore } from '@/store/useAuthStore';
import { useSoundAlerta } from '@/hooks/useSoundAlerta';

type CategoriaMural = 'chambas' | 'perdidos' | 'avisos';

const SUPERADMIN_EMAILS = ['garricraft@gmail.com', 'josegabriel@gmail.com'];

const PALETA_WHATSAPP = [
  { nombre: '#0284c7', fondo: '#f0f9ff', borde: '#bae6fd' },
  { nombre: '#7c3aed', fondo: '#f5f3ff', borde: '#ddd6fe' },
  { nombre: '#d97706', fondo: '#fffbeb', borde: '#fde68a' },
  { nombre: '#db2777', fondo: '#fdf2f8', borde: '#fbcfe8' },
  { nombre: '#0d9488', fondo: '#f0fdfa', borde: '#99f6e4' },
  { nombre: '#ea580c', fondo: '#fff7ed', borde: '#fed7aa' },
  { nombre: '#4f46e5', fondo: '#eef2ff', borde: '#c7d2fe' },
];

function getColorPorUsuario(uidStr: string) {
  let hash = 0;
  for (let i = 0; i < uidStr.length; i++) {
    hash = uidStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % PALETA_WHATSAPP.length;
  return PALETA_WHATSAPP[idx];
}

interface PublicacionMural {
  id: string;
  creadorUid: string;
  creadorNombre: string;
  descripcion: string;
  fotoUrl: string | null;
  categoria: CategoriaMural;
  cuposChamba?: number;
  duracionHoras?: number;
  tipo: 'comunidad';
  estado: 'abierta' | 'cerrada' | 'rechazada';
  expiraEn?: number;
  createdAt: any;
}

interface ComentarioMural {
  id: string;
  autorUid: string;
  autorNombre: string;
  texto: string;
  createdAt: any;
}

function contieneTextoProhibido(texto: string): { valido: boolean; razon: string } {
  const t = texto.toLowerCase();

  const soloDigitos = t.replace(/[\s.\-()]/g, '');
  if (/(?:\+?51)?9\d{8}/.test(soloDigitos)) {
    return {
      valido: false,
      razon:
        'Por seguridad no se permite escribir números de celular. Coordina aquí mismo en los comentarios públicos.',
    };
  }

  const linkRegex = /(http|https|www\.|wa\.me|instagram\.com|facebook\.com|tiktok\.com|@)/;
  if (linkRegex.test(t)) {
    return {
      valido: false,
      razon: 'No se permiten enlaces ni redes sociales externas. Todo se coordina aquí adentro.',
    };
  }

  const palabrasCensuradas = [
    'busco pareja',
    'busco novia',
    'busco novio',
    'soltera',
    'soltero',
    'chica linda',
    'chico lindo',
    'cita',
    'beso',
    'sex',
    'mi cama',
    'mi cuarto',
    'puta',
    'mierda',
    'carajo',
    'imbecil',
    'idiota',
  ];
  for (const palabra of palabrasCensuradas) {
    if (t.includes(palabra)) {
      return {
        valido: false,
        razon:
          'El Mural es un espacio respetuoso para la comunidad de Tambogrande y CP3. No se permiten coqueteos ni insultos.',
      };
    }
  }

  return { valido: true, razon: '' };
}

export default function MuralScreen() {
  const storeUser = useAuthStore((s: any) => s.user);
  const firebaseUser = useAuthStore((s: any) => s.firebaseUser);
  const uid = String(storeUser?.uid || auth.currentUser?.uid || firebaseUser?.uid || '').trim();
  const emailActual = (
    auth.currentUser?.email ||
    firebaseUser?.email ||
    storeUser?.email ||
    ''
  )
    .trim()
    .toLowerCase();

  const { reproducir } = useSoundAlerta();
  const [perfil, setPerfil] = useState<any>(null);

  const [vista, setVista] = useState<CategoriaMural>('chambas');
  const [todasPublicaciones, setTodasPublicaciones] = useState<PublicacionMural[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalNuevo, setModalNuevo] = useState(false);
  const [categoriaNueva, setCategoriaNueva] = useState<CategoriaMural>('chambas');
  const [duracionDias, setDuracionDias] = useState<1 | 2>(1);
  const [cuposChamba, setCuposChamba] = useState('3');
  const [descNueva, setDescNueva] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const [pubComentarios, setPubComentarios] = useState<PublicacionMural | null>(null);
  const [comentarios, setComentarios] = useState<ComentarioMural[]>([]);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  const esModerador = Boolean(
    storeUser?.esSuperAdmin === true ||
      perfil?.esSuperAdmin === true ||
      perfil?.esAyudante === true ||
      (emailActual && SUPERADMIN_EMAILS.includes(emailActual))
  );

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'usuarios', uid), (snap) => {
      setPerfil(snap.data() || null);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'mural'),
      where('tipo', '==', 'comunidad'),
      where('estado', '==', 'abierta')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const ahora = Date.now();
        const vigentes: PublicacionMural[] = [];

        snap.forEach((d) => {
          const data = d.data() as any;
          const createdMs = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : ahora;
          const limiteMs = data.expiraEn ? data.expiraEn : createdMs + 24 * 60 * 60 * 1000;

          if (ahora <= limiteMs) {
            vigentes.push({
              id: d.id,
              ...data,
              categoria: data.categoria || 'chambas',
            });
          }
        });

        vigentes.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setTodasPublicaciones(vigentes);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!pubComentarios) {
      setComentarios([]);
      return;
    }
    const qCom = query(collection(db, 'mural', pubComentarios.id, 'comentarios'));
    const unsub = onSnapshot(qCom, (snap) => {
      const lista: ComentarioMural[] = [];
      snap.forEach((d) => lista.push({ id: d.id, ...(d.data() as any) }));
      lista.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
      setComentarios(lista);
    });
    return unsub;
  }, [pubComentarios]);

  const publicacionesFiltradas = todasPublicaciones.filter((p) => p.categoria === vista);
  const miPublicacionActiva = todasPublicaciones.find(
    (p) => Boolean(uid) && String(p.creadorUid).trim() === uid
  );

  const subirFotoDesdeGaleria = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.4,
      });

      if (!result.canceled && result.assets[0].uri) {
        setSubiendoFoto(true);
        const url = await subirImagenStorage(
          result.assets[0].uri,
          `mural/${uid || 'anon'}/${Date.now()}.jpg`
        );
        setFotoUri(url);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo subir la imagen.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const publicarEnMural = async () => {
    if (!uid) return;

    if (miPublicacionActiva) {
      Alert.alert(
        'Ya tienes un aviso activo',
        'Solo puedes mantener 1 aviso activo a la vez. Marca el anterior como "Ya lo resolví" si deseas publicar otro.'
      );
      return;
    }

    if (!descNueva.trim()) {
      Alert.alert('Faltan datos', 'Escribe el detalle de tu aviso.');
      return;
    }

    const checkTexto = contieneTextoProhibido(descNueva);
    if (!checkTexto.valido) {
      Alert.alert('Aviso Bloqueado por Seguridad', checkTexto.razon);
      return;
    }

    const horas = duracionDias * 24;
    const numCupos = categoriaNueva === 'chambas' ? Math.max(1, Number(cuposChamba) || 1) : null;

    try {
      const nombreCreador = perfil?.nombreTienda || perfil?.nombre || storeUser?.nombre || 'Vecino';
      setModalNuevo(false);
      setDescNueva('');
      setFotoUri(null);
      setVista(categoriaNueva);

      await addDoc(collection(db, 'mural'), {
        tipo: 'comunidad',
        categoria: categoriaNueva,
        creadorUid: uid,
        creadorNombre: nombreCreador,
        descripcion: descNueva.trim(),
        fotoUrl: fotoUri || null,
        cuposChamba: numCupos,
        duracionHoras: horas,
        estado: 'abierta',
        expiraEn: Date.now() + horas * 60 * 60 * 1000,
        createdAt: serverTimestamp(),
      });
      Alert.alert(
        'Publicado',
        `Tu aviso ya está visible en el Mural por ${duracionDias === 1 ? '24 horas (1 día)' : '48 horas (2 días)'}.`
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo publicar.');
    }
  };

  const eliminarPublicacion = (pubId: string, esPorModeracion = false) => {
    Alert.alert(
      esPorModeracion ? 'Eliminar aviso (Moderación)' : 'Cerrar aviso',
      esPorModeracion
        ? '¿Eliminar esta publicación del Mural por moderación?'
        : '¿Ya resolviste este aviso y deseas borrarlo del mural?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'mural', pubId));
              if (pubComentarios?.id === pubId) setPubComentarios(null);
            } catch {
              Alert.alert('Error', 'No se pudo eliminar.');
            }
          },
        },
      ]
    );
  };

  const publicarComentario = async () => {
    if (!uid || !pubComentarios || enviandoComentario) return;
    const textoLimpio = nuevoComentario.trim();
    if (!textoLimpio) return;

    const check = contieneTextoProhibido(textoLimpio);
    if (!check.valido) {
      Alert.alert('Comentario Bloqueado', check.razon);
      return;
    }

    setEnviandoComentario(true);
    try {
      const autorNombre = perfil?.nombreTienda || perfil?.nombre || storeUser?.nombre || 'Vecino';
      setNuevoComentario('');
      await addDoc(collection(db, 'mural', pubComentarios.id, 'comentarios'), {
        autorUid: uid,
        autorNombre,
        texto: textoLimpio,
        createdAt: serverTimestamp(),
      });
      reproducir('exito');
    } catch {
      Alert.alert('Error', 'No se pudo enviar el comentario.');
    } finally {
      setEnviandoComentario(false);
    }
  };

  const eliminarComentario = async (comentarioId: string) => {
    if (!pubComentarios) return;
    try {
      await deleteDoc(doc(db, 'mural', pubComentarios.id, 'comentarios', comentarioId));
    } catch {
      Alert.alert('Error', 'No se pudo borrar el comentario.');
    }
  };

  const getEtiquetaCategoria = (cat?: CategoriaMural) => {
    if (cat === 'chambas') return '💼 Chamba / Jornal';
    if (cat === 'perdidos') return '🔍 Perdido / Encontrado';
    return '📢 Aviso / Comunicado';
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 54,
          paddingBottom: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#111827' }}>Mural Comunal</Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>
            Chambas, perdidos y avisos públicos de Tambogrande y CP3
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <View style={styles.avisoSeguridad}>
          <ShieldAlert color="#92400e" size={16} />
          <Text style={{ color: '#92400e', fontSize: 11, fontWeight: '700', flex: 1 }}>
            Espacio Público Seguro: Todos los comentarios son visibles para la comunidad. Se
            bloquean automáticamente números de celular, enlaces y faltas de respeto.
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            onPress={() => setVista('chambas')}
            style={[styles.tabChip, vista === 'chambas' && styles.tabChipActive]}
          >
            <Briefcase color={vista === 'chambas' ? '#fff' : '#374151'} size={14} />
            <Text style={[styles.tabChipText, vista === 'chambas' && { color: '#fff' }]}>
              💼 Trabajo / Jornal
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setVista('perdidos')}
            style={[styles.tabChip, vista === 'perdidos' && styles.tabChipActive]}
          >
            <Search color={vista === 'perdidos' ? '#fff' : '#374151'} size={14} />
            <Text style={[styles.tabChipText, vista === 'perdidos' && { color: '#fff' }]}>
              🔍 Perdidos
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setVista('avisos')}
            style={[styles.tabChip, vista === 'avisos' && styles.tabChipActive]}
          >
            <Megaphone color={vista === 'avisos' ? '#fff' : '#374151'} size={14} />
            <Text style={[styles.tabChipText, vista === 'avisos' && { color: '#fff' }]}>
              📢 Avisos / Comunidad
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        {miPublicacionActiva ? (
          <View style={styles.limiteActivoCard}>
            <CheckCircle2 color="#059669" size={18} />
            <Text style={{ color: '#065f46', fontSize: 12, fontWeight: '700', flex: 1 }}>
              Ya tienes tu publicación activa (1 por persona). Bórrala con "Ya lo resolví" si
              deseas subir otra.
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setCategoriaNueva(vista);
              setModalNuevo(true);
            }}
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
            <LayoutGrid color="#fff" size={18} />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
              Publicar en el Mural (Gratis · 1 o 2 días)
            </Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={publicacionesFiltradas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#059669" style={{ marginTop: 40 }} />
          ) : (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <LayoutGrid color="#d1d5db" size={40} />
              <Text style={{ color: '#9ca3af', marginTop: 12, textAlign: 'center' }}>
                No hay avisos comunales en esta sección ahora.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const horasRestantes = item.expiraEn
            ? Math.max(1, Math.ceil((item.expiraEn - Date.now()) / (1000 * 60 * 60)))
            : 24;
          const esMio = Boolean(uid && uid === String(item.creadorUid).trim());

          return (
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 16,
                marginBottom: 14,
                borderWidth: 1,
                borderColor: '#e5e7eb',
                elevation: 1,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#d1fae5',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '800', color: '#059669', fontSize: 16 }}>
                    {item.creadorNombre ? item.creadorNombre.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>
                    {item.creadorNombre}
                  </Text>
                  <Text style={{ color: '#059669', fontSize: 12, fontWeight: '700' }}>
                    {getEtiquetaCategoria(item.categoria)} · Quedan {horasRestantes}h
                  </Text>
                </View>

                {esModerador && !esMio && (
                  <Pressable
                    onPress={() => eliminarPublicacion(item.id, true)}
                    style={{ backgroundColor: '#fee2e2', padding: 7, borderRadius: 8 }}
                  >
                    <Trash2 color="#dc2626" size={16} />
                  </Pressable>
                )}
              </View>

              {item.categoria === 'chambas' && item.cuposChamba ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor: '#ecfdf5',
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                >
                  <Users color="#059669" size={14} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#065f46' }}>
                    Se buscan {item.cuposChamba} persona{item.cuposChamba > 1 ? 's' : ''}
                  </Text>
                </View>
              ) : null}

              <Text style={{ color: '#374151', fontSize: 15, lineHeight: 21, marginBottom: 10 }}>
                {item.descripcion}
              </Text>

              {item.fotoUrl ? (
                <Image
                  source={{ uri: item.fotoUrl }}
                  style={{ width: '100%', height: 190, borderRadius: 14, marginBottom: 10 }}
                  resizeMode="cover"
                />
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setPubComentarios(item)}
                  style={{
                    flex: 1,
                    backgroundColor: esMio ? '#f3f4f6' : '#059669',
                    paddingVertical: 12,
                    borderRadius: 12,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 6,
                    borderWidth: esMio ? 1 : 0,
                    borderColor: '#d1d5db',
                  }}
                >
                  <MessageCircle color={esMio ? '#111827' : '#fff'} size={17} />
                  <Text
                    style={{
                      color: esMio ? '#111827' : '#fff',
                      fontWeight: '800',
                      fontSize: 13,
                    }}
                  >
                    Comentarios públicos
                  </Text>
                </Pressable>

                {esMio && (
                  <Pressable
                    onPress={() => eliminarPublicacion(item.id, false)}
                    style={{
                      flex: 1,
                      backgroundColor: '#d1fae5',
                      paddingVertical: 12,
                      borderRadius: 12,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CheckCircle2 color="#065f46" size={16} />
                    <Text style={{ color: '#065f46', fontWeight: '800', fontSize: 13 }}>
                      Ya lo resolví
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Modal Publicar en el Mural */}
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
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
                Publicar en el Mural
              </Text>
              <Pressable onPress={() => setModalNuevo(false)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            <Text style={styles.label}>1. Elige la sección:</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {(
                [
                  { id: 'chambas', label: '💼 Chamba' },
                  { id: 'perdidos', label: '🔍 Perdido' },
                  { id: 'avisos', label: '📢 Aviso vecinal' },
                ] as const
              ).map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategoriaNueva(cat.id)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: categoriaNueva === cat.id ? '#059669' : '#f3f4f6',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: categoriaNueva === cat.id ? '#fff' : '#374151',
                    }}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>2. ¿Cuánto tiempo estará visible?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {([1, 2] as const).map((dias) => (
                <Pressable
                  key={dias}
                  onPress={() => setDuracionDias(dias)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: duracionDias === dias ? '#111827' : '#f3f4f6',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: duracionDias === dias ? '#fff' : '#374151',
                    }}
                  >
                    {dias === 1 ? '⏱️ 1 día (24 horas)' : '📅 2 días (48 horas)'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {categoriaNueva === 'chambas' && (
              <>
                <Text style={styles.label}>¿Cuántas personas necesitas?</Text>
                <TextInput
                  value={cuposChamba}
                  onChangeText={setCuposChamba}
                  keyboardType="numeric"
                  placeholder="Ej: 4"
                  style={styles.input}
                />
              </>
            )}

            <Text style={styles.label}>Detalle del aviso (No escribir celulares):</Text>
            <TextInput
              value={descNueva}
              onChangeText={setDescNueva}
              placeholder={
                categoriaNueva === 'chambas'
                  ? 'Ej: Se necesita personal para cosecha de mango mañana en CP3. Pago S/ 45 el día...'
                  : categoriaNueva === 'perdidos'
                    ? 'Ej: Se perdió celular Xiaomi negro con funda azul cerca al paradero de CP3...'
                    : 'Ej: Hoy reunión vecinal a las 7PM en el local comunal...'
              }
              multiline
              style={[styles.input, { minHeight: 85, textAlignVertical: 'top' }]}
            />

            <Text style={styles.label}>Foto real (opcional)</Text>
            <Pressable
              onPress={subirFotoDesdeGaleria}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: '#f9fafb',
                borderRadius: 14,
                padding: 12,
                borderWidth: 1,
                borderColor: '#e5e7eb',
                marginTop: 4,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: fotoUri ? '#d1fae5' : '#f3f4f6',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {subiendoFoto ? (
                  <ActivityIndicator color="#059669" size={18} />
                ) : fotoUri ? (
                  <CheckCircle2 color="#059669" size={20} />
                ) : (
                  <Camera color="#6b7280" size={20} />
                )}
              </View>
              <Text style={{ flex: 1, color: '#374151', fontSize: 14 }}>
                {subiendoFoto
                  ? 'Subiendo foto...'
                  : fotoUri
                    ? '✓ Foto lista'
                    : 'Toca para adjuntar foto'}
              </Text>
            </Pressable>

            <Pressable
              onPress={publicarEnMural}
              disabled={subiendoFoto}
              style={{
                backgroundColor: '#059669',
                paddingVertical: 15,
                borderRadius: 16,
                alignItems: 'center',
                marginTop: 16,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                Publicar Aviso ({duracionDias === 1 ? '24h' : '48h'})
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Comentarios Públicos estilo WhatsApp con colores por vecino */}
      <Modal
        visible={!!pubComentarios}
        transparent
        animationType="slide"
        onRequestClose={() => setPubComentarios(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <View
            style={{
              backgroundColor: '#efeae2',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 18,
              paddingBottom: 22,
              height: '84%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#d6d3d1',
                backgroundColor: '#fff',
                marginHorizontal: -18,
                marginTop: -18,
                paddingHorizontal: 20,
                paddingTop: 18,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
              }}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#111827' }}>
                  Comentarios públicos
                </Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }} numberOfLines={1}>
                  Aviso de {pubComentarios?.creadorNombre}: {pubComentarios?.descripcion}
                </Text>
              </View>
              <Pressable onPress={() => setPubComentarios(null)}>
                <X color="#6b7280" size={24} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
              {comentarios.length === 0 ? (
                <View style={{ alignItems: 'center', marginTop: 40 }}>
                  <MessageCircle color="#9ca3af" size={38} />
                  <Text style={{ color: '#6b7280', marginTop: 10, textAlign: 'center', fontWeight: '600' }}>
                    Aún no hay comentarios.{'\n'}Sé el primero en responder o consultar aquí.
                  </Text>
                </View>
              ) : (
                comentarios.map((c) => {
                  const esMioComentario = c.autorUid === uid;
                  const esAutorAviso = c.autorUid === pubComentarios?.creadorUid;
                  const puedeBorrar = esMioComentario || esModerador;
                  const paleta = getColorPorUsuario(c.autorUid || c.autorNombre);

                  return (
                    <View
                      key={c.id}
                      style={{
                        alignSelf: esMioComentario ? 'flex-end' : 'flex-start',
                        maxWidth: '86%',
                        backgroundColor: esMioComentario ? '#dcfce7' : paleta.fondo,
                        borderRadius: 16,
                        borderTopRightRadius: esMioComentario ? 4 : 16,
                        borderTopLeftRadius: esMioComentario ? 16 : 4,
                        padding: 12,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: esMioComentario ? '#86efac' : paleta.borde,
                        elevation: 1,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 3,
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: '800',
                            fontSize: 12,
                            color: esMioComentario ? '#065f46' : paleta.nombre,
                          }}
                        >
                          {esMioComentario ? 'Tú' : c.autorNombre}{' '}
                          {esAutorAviso ? (
                            <Text style={{ color: '#059669', fontSize: 10 }}>· Autor</Text>
                          ) : null}
                        </Text>

                        {puedeBorrar && (
                          <Pressable onPress={() => eliminarComentario(c.id)} hitSlop={8}>
                            <Trash2 color="#dc2626" size={13} />
                          </Pressable>
                        )}
                      </View>
                      <Text style={{ fontSize: 14, color: '#1f2937', lineHeight: 19 }}>
                        {c.texto}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingTop: 6,
              }}
            >
              <TextInput
                value={nuevoComentario}
                onChangeText={setNuevoComentario}
                placeholder="Escribe un comentario público (sin celulares)..."
                style={{
                  flex: 1,
                  backgroundColor: '#fff',
                  borderRadius: 22,
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                  color: '#111827',
                }}
              />
              <Pressable
                onPress={publicarComentario}
                disabled={enviandoComentario}
                style={{
                  backgroundColor: '#059669',
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  justifyContent: 'center',
                  alignItems: 'center',
                  elevation: 2,
                }}
              >
                <Send color="#fff" size={18} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#111827',
    marginBottom: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tabChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  avisoSeguridad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  limiteActivoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
});