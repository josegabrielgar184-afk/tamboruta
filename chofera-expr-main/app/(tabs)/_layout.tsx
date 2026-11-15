import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TextInput,
  Alert,
} from "react-native";
import { Tabs, useRouter } from "expo-router";
import { onSnapshot, doc, setDoc, collection, query, where } from "firebase/firestore";
import { MessageSquare, Home, Store, User, Shield, MessageCircle } from "lucide-react-native";
import { auth, db } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";

export default function TabsLayout() {
  const router = useRouter();
  const storeUser = useAuthStore((s: any) => s.user);
  const uid = storeUser?.uid || auth.currentUser?.uid;

  const [cargandoPerfil, setCargandoPerfil] = useState(true);
  const [requiereOnboarding, setRequiereOnboarding] = useState(false);
  const [perfilActual, setPerfilActual] = useState<any>(null);

  const [rol, setRol] = useState<"pasajero" | "chofer" | "tienda" | null>(null);
  const [tipoVehiculo, setTipoVehiculo] = useState<"Mototaxi" | "Auto">("Mototaxi");
  const [guardando, setGuardando] = useState(false);
  const [datos, setDatos] = useState({
    nombre: "",
    telefono: "",
    placa: "",
    vehiculoModelo: "",
    vehiculoColor: "",
    nombreTienda: "",
    categoriaTienda: "",
    direccionTienda: "",
    yapeTienda: "",
  });

  // Estado de burbuja flotante estilo Messenger para viaje en curso en todas las pestañas
  const [viajeActivo, setViajeActivo] = useState<{
    id: string;
    contraparte: string;
    precio: number;
  } | null>(null);
  const [mensajesSinLeer, setMensajesSinLeer] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCargandoPerfil(false);
      setRequiereOnboarding(false);
      setPerfilActual(null);
      return;
    }

    const unsub = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      const info = snap.data();
      setPerfilActual(info || null);
      const esAdmin =
        info?.rol === "superadmin" ||
        info?.rol === "admin" ||
        info?.esSuperAdmin === true;
      setRequiereOnboarding(!esAdmin && (!info || info.rolBloqueado !== true));
      setCargandoPerfil(false);
    });

    return () => unsub();
  }, [uid]);

  const rolUsuario = (perfilActual?.rol || storeUser?.rol) as string | undefined;
  const esChofer = rolUsuario === "chofer";
  const esSuperAdmin =
    rolUsuario === "superadmin" ||
    rolUsuario === "admin" ||
    perfilActual?.esSuperAdmin === true;

  // Escucha viaje activo para mostrar burbuja flotante sobre cualquier pestaña
  useEffect(() => {
    if (!uid) return;
    const campoUid = esChofer ? "choferUid" : "clienteUid";
    const q = query(
      collection(db, "chats"),
      where(campoUid, "==", uid),
      where("estado", "==", "en_curso")
    );

    const unsub = onSnapshot(q, (snap) => {
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
          ? data.clienteNombre || "Pasajero"
          : data.choferNombre || "Chofer",
        precio: data.precioAcordado ?? data.precio ?? 0,
      });
    });

    return () => unsub();
  }, [uid, esChofer]);

  // Contador de mensajes sin leer para la burbuja flotante
  useEffect(() => {
    if (!viajeActivo?.id || !uid) return;
    const q = query(
      collection(db, "chats", viajeActivo.id, "mensajes"),
      where("leido", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      snap.forEach((docMsg) => {
        const m = docMsg.data() as any;
        if (m.senderUid && m.senderUid !== uid) count++;
      });
      setMensajesSinLeer(count);
    });
    return () => unsub();
  }, [viajeActivo?.id, uid]);

  const handleConfirmarRegistro = async () => {
    if (!uid || !rol) {
      Alert.alert("Falta elegir rol", "Selecciona si serás Pasajero, Chofer o Tienda.");
      return;
    }

    if (rol === "pasajero" && (!datos.nombre.trim() || !datos.telefono.trim())) {
      Alert.alert("Datos incompletos", "Ingresa tu nombre completo y teléfono.");
      return;
    }

    if (
      rol === "chofer" &&
      (!datos.nombre.trim() ||
        !datos.telefono.trim() ||
        !datos.placa.trim() ||
        !datos.vehiculoModelo.trim() ||
        !datos.vehiculoColor.trim())
    ) {
      Alert.alert("Datos incompletos", "Completa todos los datos de tu vehículo y contacto.");
      return;
    }

    if (
      rol === "tienda" &&
      (!datos.nombreTienda.trim() ||
        !datos.categoriaTienda.trim() ||
        !datos.direccionTienda.trim() ||
        !datos.yapeTienda.trim())
    ) {
      Alert.alert("Datos incompletos", "Completa todos los datos de tu tienda y Yape/Plin.");
      return;
    }

    try {
      setGuardando(true);
      await setDoc(
        doc(db, "usuarios", uid),
        {
          ...datos,
          nombre: rol === "tienda" ? datos.nombreTienda.trim() : datos.nombre.trim(),
          rol,
          tipoVehiculo: rol === "chofer" ? tipoVehiculo : null,
          rolBloqueado: true,
          estadoMembresia: "trial",
          plan: "plata",
          fechaVencimiento: Date.now() + 15 * 24 * 60 * 60 * 1000,
          mesesPagados: 0,
        },
        { merge: true }
      );
      setRequiereOnboarding(false);
    } catch (error: any) {
      Alert.alert("Error al guardar", error?.message || "Intenta nuevamente.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#059669",
          tabBarInactiveTintColor: "#6b7280",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Rutas",
            tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="tienda"
          options={{
            title: "Tienda",
            tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="mural"
          options={{
            title: "Mural",
            tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{
            title: "Perfil",
            tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            href: esSuperAdmin ? undefined : null,
            title: "Admin",
            tabBarIcon: ({ color, size }) => <Shield color={color} size={size} />,
          }}
        />
      </Tabs>

      {/* Burbuja flotante estilo Messenger visible en Rutas, Tienda, Mural y Perfil */}
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

      <Modal
        visible={!cargandoPerfil && Boolean(uid) && requiereOnboarding}
        animationType="slide"
        transparent={false}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: "#f9fafb" }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Completa tu Registro</Text>
            <Text style={styles.warning}>
              Tu rol será permanente y recibirás 15 días gratis de prueba.
            </Text>

            <View style={styles.roleRow}>
              {(["pasajero", "chofer", "tienda"] as const).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setRol(item)}
                  style={[styles.roleBtn, rol === item && styles.roleBtnActive]}
                >
                  <Text style={[styles.roleText, rol === item && styles.roleTextActive]}>
                    {item === "pasajero" ? "Pasajero" : item === "chofer" ? "Chofer" : "Tienda"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {rol === "pasajero" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre completo"
                  value={datos.nombre}
                  onChangeText={(v) => setDatos({ ...datos, nombre: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Teléfono / WhatsApp"
                  keyboardType="phone-pad"
                  value={datos.telefono}
                  onChangeText={(v) => setDatos({ ...datos, telefono: v })}
                />
              </>
            )}

            {rol === "chofer" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre completo del chofer"
                  value={datos.nombre}
                  onChangeText={(v) => setDatos({ ...datos, nombre: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Teléfono / WhatsApp"
                  keyboardType="phone-pad"
                  value={datos.telefono}
                  onChangeText={(v) => setDatos({ ...datos, telefono: v })}
                />
                <View style={styles.roleRow}>
                  {(["Mototaxi", "Auto"] as const).map((tipo) => (
                    <Pressable
                      key={tipo}
                      onPress={() => setTipoVehiculo(tipo)}
                      style={[styles.roleBtn, tipoVehiculo === tipo && styles.roleBtnActive]}
                    >
                      <Text
                        style={[
                          styles.roleText,
                          tipoVehiculo === tipo && styles.roleTextActive,
                        ]}
                      >
                        {tipo}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Placa del vehículo (Ej. 1234-AB)"
                  autoCapitalize="characters"
                  value={datos.placa}
                  onChangeText={(v) => setDatos({ ...datos, placa: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Marca / Modelo (Ej. Bajaj Torito)"
                  value={datos.vehiculoModelo}
                  onChangeText={(v) => setDatos({ ...datos, vehiculoModelo: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Color del vehículo"
                  value={datos.vehiculoColor}
                  onChangeText={(v) => setDatos({ ...datos, vehiculoColor: v })}
                />
              </>
            )}

            {rol === "tienda" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre de la tienda o negocio"
                  value={datos.nombreTienda}
                  onChangeText={(v) => setDatos({ ...datos, nombreTienda: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Categoría (Ej. Bodega, Comida, Farmacia)"
                  value={datos.categoriaTienda}
                  onChangeText={(v) => setDatos({ ...datos, categoriaTienda: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Dirección exacta en Tambogrande"
                  value={datos.direccionTienda}
                  onChangeText={(v) => setDatos({ ...datos, direccionTienda: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Número de Yape o Plin para cobros"
                  keyboardType="phone-pad"
                  value={datos.yapeTienda}
                  onChangeText={(v) => setDatos({ ...datos, yapeTienda: v })}
                />
              </>
            )}

            <Pressable
              style={[styles.submitBtn, guardando && { opacity: 0.6 }]}
              onPress={handleConfirmarRegistro}
              disabled={guardando}
            >
              <Text style={styles.submitText}>
                {guardando ? "Guardando..." : "Confirmar Registro"}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalContent: { padding: 24, paddingTop: 48, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: "bold", color: "#111827", marginBottom: 8 },
  warning: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
    padding: 12,
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 20,
  },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  roleBtnActive: { backgroundColor: "#059669", borderColor: "#059669" },
  roleText: { fontWeight: "600", color: "#374151" },
  roleTextActive: { color: "#fff" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    fontSize: 15,
  },
  submitBtn: {
    backgroundColor: "#059669",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  submitText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  burbujaFlotante: {
    position: "absolute",
    bottom: 68,
    right: 16,
    backgroundColor: "#059669",
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: "#ffffff",
    zIndex: 999,
  },
  burbujaIconoWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  burbujaBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  burbujaBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  burbujaTitulo: { color: "#fff", fontSize: 12, fontWeight: "800" },
  burbujaSubtitulo: { color: "#d1fae5", fontSize: 11, fontWeight: "600" },
});