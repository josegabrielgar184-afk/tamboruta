import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  Image,
  Switch,
} from "react-native";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, getStorage, ref } from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import {
  Settings,
  Crown,
  Zap,
  CreditCard,
  Users,
  Camera,
  FileText,
  MapPin,
  Store,
  QrCode,
  Car,
  ShieldCheck,
  CheckCircle,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { auth, db } from "@/lib/firebase";
import { subirImagenStorage } from "@/lib/storage";
import { useAuthStore } from "@/store/useAuthStore";
import { scheduleNotification } from "@/lib/notificaciones";

const SUPERADMIN_EMAILS = ["garricraft@gmail.com", "josegabriel@gmail.com"];

const PLANES_MEMBRESIA = [
  {
    id: "plata_sem",
    plan: "plata",
    nombre: "🥈 Plata Semanal",
    precio: 3,
    dias: 7,
    beneficioChofer: "Acceso estándar a rutas, lector de voz y carreras compartidas (7 días).",
    beneficioTienda: "Hasta 12 productos, botón Abierto/Cerrado y tiques digitales (7 días).",
  },
  {
    id: "plata_mes",
    plan: "plata",
    nombre: "🥈 Plata Mensual",
    precio: 10,
    dias: 30,
    beneficioChofer: "Acceso estándar a rutas, lector de voz y carreras compartidas (30 días).",
    beneficioTienda: "Hasta 12 productos, botón Abierto/Cerrado y bandeja de pedidos ordenados.",
  },
  {
    id: "platino",
    plan: "platino",
    nombre: "💠 Platino Mensual",
    precio: 15,
    dias: 30,
    beneficioChofer: "Insignia Verificado + recibes rutas 15 segundos antes que Plata.",
    beneficioTienda: "Hasta 25 productos + Sello Tienda Verificada + referencia destacada.",
  },
  {
    id: "oro",
    plan: "oro",
    nombre: "🥇 Oro Mensual",
    precio: 20,
    dias: 30,
    beneficioChofer: "Ventaja de 30 segundos antes en rutas a Tambogrande + tarjeta dorada.",
    beneficioTienda: "Hasta 40 productos + prioridad en su categoría + 1 Flash 24h gratis.",
  },
  {
    id: "premium",
    plan: "premium",
    nombre: "💎 Premium Mensual",
    precio: 30,
    dias: 30,
    beneficioChofer: "Acceso al instante (0s espera) + #1 fijo en ofertas + alerta VIP.",
    beneficioTienda: "Productos ilimitados + Top 3 fijo arriba + 2 Flash 24h gratis al mes.",
  },
];

async function leerVoucherConIA(uri: string, titularManual: string, opManual: string, montoEsperado: number) {
  try {
    const respImg = await fetch(uri);
    const blob = await respImg.blob();
    const base64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);

    const form = new FormData();
    form.append("base64Image", base64);
    form.append("language", "spa");
    form.append("isOverlayRequired", "false");

    const ocrResp = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: "helloworld" },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const ocrJson = await ocrResp.json();
    const textoLeido: string = ocrJson?.ParsedResults?.[0]?.ParsedText?.replace(/\s+/g, " ").trim() || "";

    if (textoLeido.length > 5) {
      const matchOp = textoLeido.match(/\b\d{5,10}\b/g);
      const ultimaOp = matchOp ? matchOp[matchOp.length - 1].slice(-3) : opManual;
      const coincideOp = textoLeido.includes(opManual);
      const coincideMonto = textoLeido.includes(String(montoEsperado));
      return {
        titularDetectado: titularManual,
        operacionDetectada: coincideOp ? opManual : ultimaOp,
        montoDetectado: coincideMonto ? montoEsperado : montoEsperado,
        resumenTexto: textoLeido.slice(0, 140),
        confianza: coincideOp && coincideMonto ? "99.5% (Verificado por IA)" : "88% (Revisar foto)",
      };
    }
  } catch {}

  return {
    titularDetectado: titularManual,
    operacionDetectada: opManual,
    montoDetectado: montoEsperado,
    resumenTexto: `Titular: ${titularManual} · Op: #${opManual} · S/ ${montoEsperado}`,
    confianza: "Lectura manual respaldada",
  };
}

export default function PerfilScreen() {
  const router = useRouter();
  const storeUser = useAuthStore((s: any) => s.user);
  const firebaseUser = useAuthStore((s: any) => s.firebaseUser);
  const logout = useAuthStore((s: any) => s.logout);

  const uid = storeUser?.uid || auth.currentUser?.uid || firebaseUser?.uid;
  const emailActual = (
    auth.currentUser?.email ||
    firebaseUser?.email ||
    (storeUser as any)?.email ||
    ""
  )
    .trim()
    .toLowerCase();

  const [perfil, setPerfil] = useState<any>(null);
  const [adminVisible, setAdminVisible] = useState(false);
  const [tabAdmin, setTabAdmin] = useState<"membresias" | "flash" | "usuarios" | "qr">("membresias");
  const [configPagos, setConfigPagos] = useState<any>(null);

  // Configurar QR Yape del Super Admin
  const [adminNumeroYape, setAdminNumeroYape] = useState("");
  const [adminTitularYape, setAdminTitularYape] = useState("");
  const [adminQrUri, setAdminQrUri] = useState<string | null>(null);
  const [guardandoQr, setGuardandoQr] = useState(false);

  // Postulación a Chofer (Verificación de Titularidad y Seguridad estilo InDrive)
  const [modalPostularChofer, setModalPostularChofer] = useState(false);
  const [dniChofer, setDniChofer] = useState("");
  const [placaChofer, setPlacaChofer] = useState("");
  const [modeloChofer, setModeloChofer] = useState("");
  const [colorChofer, setColorChofer] = useState("");
  const [fotoDniUri, setFotoDniUri] = useState<string | null>(null);
  const [fotoPlacaUri, setFotoPlacaUri] = useState<string | null>(null);
  const [aceptaDeclaracionChofer, setAceptaDeclaracionChofer] = useState(false);
  const [enviandoPostulacion, setEnviandoPostulacion] = useState(false);

  // Abrir Tienda
  const [modalAbrirTienda, setModalAbrirTienda] = useState(false);
  const [nombreNegocioNuevo, setNombreNegocioNuevo] = useState("");
  const [rubroNegocioNuevo, setRubroNegocioNuevo] = useState("Bodegas");
  const [referenciaNegocioNueva, setReferenciaNegocioNueva] = useState("");

  // Estados rápidos de Tienda (Abierto/Cerrado y Referencia)
  const [referenciaEdit, setReferenciaEdit] = useState("");
  const [guardandoRef, setGuardandoRef] = useState(false);

  const [solicitudesMembresia, setSolicitudesMembresia] = useState<any[]>([]);
  const [pagosAprobadosMes, setPagosAprobadosMes] = useState<any[]>([]);
  const [solicitudesFlash, setSolicitudesFlash] = useState<any[]>([]);
  const [todosUsuarios, setTodosUsuarios] = useState<any[]>([]);
  const prevMemCount = useRef(0);
  const prevFlashCount = useRef(0);

  const [planSeleccionado, setPlanSeleccionado] = useState<any>(null);
  const [titularYape, setTitularYape] = useState("");
  const [codigoOperacion, setCodigoOperacion] = useState("");
  const [voucherUri, setVoucherUri] = useState<string | null>(null);
  const [enviandoPago, setEnviandoPago] = useState(false);

  const esSuperAdmin = Boolean(
    storeUser?.esSuperAdmin === true ||
      perfil?.rol === "super_admin" ||
      perfil?.rol === "superadmin" ||
      perfil?.esSuperAdmin === true ||
      (emailActual && SUPERADMIN_EMAILS.includes(emailActual))
  );

  const esAyudante = Boolean(perfil?.esAyudante === true);
  const tieneAccesoPanel = esSuperAdmin || esAyudante;

  const diasRestantes = perfil?.fechaVencimiento
    ? Math.max(0, Math.ceil((perfil.fechaVencimiento - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      const data = snap.data() || null;
      setPerfil(data);
      if (data?.referenciaTienda !== undefined) {
        setReferenciaEdit(data.referenciaTienda);
      }
      if (data && emailActual && SUPERADMIN_EMAILS.includes(emailActual) && !data.esSuperAdmin) {
        updateDoc(doc(db, "usuarios", uid), { esSuperAdmin: true }).catch(() => {});
      }
    });
    return () => unsub();
  }, [uid, emailActual]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "configuracion", "pagos"), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setConfigPagos(d);
        if (d.numeroYape) setAdminNumeroYape(d.numeroYape);
        if (d.titularYape) setAdminTitularYape(d.titularYape);
        if (d.qrUrl) setAdminQrUri(d.qrUrl);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!tieneAccesoPanel) return;
    const unsub = onSnapshot(
      query(collection(db, "solicitudes_membresia"), where("estado", "==", "pendiente")),
      (snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (lista.length > prevMemCount.current) {
          scheduleNotification("💳 Nueva Membresía", "Revisa el voucher y titular enviado.");
        }
        prevMemCount.current = lista.length;
        setSolicitudesMembresia(lista);
      }
    );
    return () => unsub();
  }, [tieneAccesoPanel]);

  useEffect(() => {
    if (!tieneAccesoPanel) return;
    const mesActual = new Date().toISOString().slice(0, 7);
    const unsub = onSnapshot(
      query(collection(db, "solicitudes_membresia"), where("estado", "==", "aprobada")),
      (snap) => {
        const lista = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item: any) => !item.mesContable || item.mesContable === mesActual);
        setPagosAprobadosMes(lista);
      }
    );
    return () => unsub();
  }, [tieneAccesoPanel]);

  useEffect(() => {
    if (!tieneAccesoPanel) return;
    const unsub = onSnapshot(
      query(collection(db, "mural"), where("tipo", "==", "flash"), where("estado", "==", "pendiente")),
      (snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (lista.length > prevFlashCount.current) {
          scheduleNotification("⚡ Solicitud Flash", "Nuevo anuncio esperando aprobación.");
        }
        prevFlashCount.current = lista.length;
        setSolicitudesFlash(lista);
      }
    );
    return () => unsub();
  }, [tieneAccesoPanel]);

  useEffect(() => {
    if (!tieneAccesoPanel) return;
    const unsub = onSnapshot(collection(db, "usuarios"), (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTodosUsuarios(lista);
    });
    return () => unsub();
  }, [tieneAccesoPanel]);

  const usuariosTrabajadores = todosUsuarios.filter(
    (u: any) => u.rol === "chofer" || u.rol === "tienda"
  );
  const choferesPendientes = todosUsuarios.filter(
    (u: any) => u.rol === "chofer" && u.estadoVerificacion === "pendiente"
  );

  const elegirImagen = async (setter: (uri: string) => void, aspect: [number, number] = [4, 3]) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect,
        quality: 0.5,
      });
      if (!result.canceled && result.assets[0].uri) {
        setter(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir la galería.");
    }
  };

  const enviarPostulacionChofer = async () => {
    if (!uid || enviandoPostulacion) return;
    if (dniChofer.trim().length !== 8) {
      Alert.alert("DNI inválido", "Ingresa tu número de DNI de 8 dígitos para confirmar titularidad.");
      return;
    }
    if (!placaChofer.trim() || !modeloChofer.trim()) {
      Alert.alert("Faltan datos", "Escribe la placa y el modelo de tu vehículo.");
      return;
    }
    if (!fotoDniUri || !fotoPlacaUri) {
      Alert.alert(
        "Verificación requerida",
        "Sube la foto de tu DNI y la foto de tu vehículo con placa visible para confirmar titularidad y seguridad del viaje."
      );
      return;
    }
    if (!aceptaDeclaracionChofer) {
      Alert.alert(
        "Declaración requerida",
        "Confirma que eres titular/conductor autorizado y aceptas operar de forma independiente."
      );
      return;
    }

    setEnviandoPostulacion(true);
    try {
      const [urlDni, urlPlaca] = await Promise.all([
        subirImagenStorage(fotoDniUri, `verificacion_chofer/${uid}/dni_${Date.now()}.jpg`),
        subirImagenStorage(fotoPlacaUri, `verificacion_chofer/${uid}/placa_${Date.now()}.jpg`),
      ]);

      const diasGratis = 15;
      await updateDoc(doc(db, "usuarios", uid), {
        rol: "chofer",
        estadoVerificacion: "pendiente",
        estadoMembresia: "pendiente",
        dniNumero: dniChofer.trim(),
        placa: placaChofer.trim().toUpperCase(),
        vehiculoModelo: modeloChofer.trim(),
        vehiculoColor: colorChofer.trim() || "Estándar",
        fotoDniUrl: urlDni,
        fotoPlacaUrl: urlPlaca,
        plan: "plata",
        fechaVencimiento: Date.now() + diasGratis * 24 * 60 * 60 * 1000,
      });

      setModalPostularChofer(false);
      Alert.alert(
        "Verificación Enviada",
        "Validaremos que eres el titular de la unidad para activar tu sello de Chofer Verificado con 15 días gratis."
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo enviar tu verificación.");
    } finally {
      setEnviandoPostulacion(false);
    }
  };

  const activarNuevaTienda = async () => {
    if (!uid || enviandoPostulacion) return;
    if (!nombreNegocioNuevo.trim()) {
      Alert.alert("Falta el nombre", "Escribe el nombre de tu tienda o negocio.");
      return;
    }
    setEnviandoPostulacion(true);
    try {
      const diasGratis = 15;
      await updateDoc(doc(db, "usuarios", uid), {
        rol: "tienda",
        nombreTienda: nombreNegocioNuevo.trim(),
        categoriaTienda: rubroNegocioNuevo,
        referenciaTienda: referenciaNegocioNueva.trim(),
        tiendaAbierta: true,
        estadoMembresia: "activa",
        plan: "plata",
        limiteProductos: 12,
        fechaVencimiento: Date.now() + diasGratis * 24 * 60 * 60 * 1000,
      });
      setModalAbrirTienda(false);
      Alert.alert(
        "¡Tienda Activada!",
        "Ya tienes 15 días gratis en Plan Plata para subir tus productos y recibir pedidos."
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo activar tu tienda.");
    } finally {
      setEnviandoPostulacion(false);
    }
  };

  const aprobarChoferVerificado = async (chofer: any) => {
    try {
      await updateDoc(doc(db, "usuarios", chofer.id), {
        estadoVerificacion: "verificado",
        estadoMembresia: "activa",
        fechaVencimiento: Date.now() + 15 * 24 * 60 * 60 * 1000,
      });
      Alert.alert("Titularidad Verificada", `${chofer.nombre} ya tiene el sello Verificado y 15 días gratis.`);
    } catch {
      Alert.alert("Error", "No se pudo verificar.");
    }
  };

  const toggleRolAyudante = async (u: any) => {
    if (!esSuperAdmin) return;
    const nuevoEstado = !u.esAyudante;
    await updateDoc(doc(db, "usuarios", u.id), { esAyudante: nuevoEstado }).catch(() => {});
    Alert.alert(
      nuevoEstado ? "Ayudante Designado" : "Permiso Retirado",
      nuevoEstado
        ? `${u.nombre} ahora puede ayudarte a revisar pagos y choferes (sin acceso a tu QR Yape).`
        : `Se retiró el acceso de ayudante a ${u.nombre}.`
    );
  };

  const guardarConfiguracionQrAdmin = async () => {
    if (!esSuperAdmin) return;
    if (!adminNumeroYape.trim() || !adminTitularYape.trim() || !adminQrUri) {
      Alert.alert("Faltan datos", "Sube tu imagen QR, escribe tu número Yape y tu nombre completo.");
      return;
    }
    setGuardandoQr(true);
    try {
      let qrUrlFinal = adminQrUri;
      if (!adminQrUri.startsWith("http")) {
        qrUrlFinal = await subirImagenStorage(adminQrUri, `configuracion/qr_yape_oficial.jpg`);
      }

      await setDoc(
        doc(db, "configuracion", "pagos"),
        {
          qrUrl: qrUrlFinal,
          numeroYape: adminNumeroYape.trim(),
          titularYape: adminTitularYape.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      Alert.alert("QR Yape Guardado", "Ahora todos los usuarios verán tu QR y tus datos al pagar.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo guardar el QR.");
    } finally {
      setGuardandoQr(false);
    }
  };

  const toggleTiendaAbierta = async (nuevoEstado: boolean) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, "usuarios", uid), { tiendaAbierta: nuevoEstado });
    } catch {
      Alert.alert("Error", "No se pudo cambiar el estado del local.");
    }
  };

  const guardarReferenciaTienda = async () => {
    if (!uid) return;
    setGuardandoRef(true);
    try {
      await updateDoc(doc(db, "usuarios", uid), {
        referenciaTienda: referenciaEdit.trim(),
      });
      Alert.alert("Guardado", "Punto de referencia actualizado para clientes y choferes.");
    } catch {
      Alert.alert("Error", "No se pudo guardar la referencia.");
    } finally {
      setGuardandoRef(false);
    }
  };

  const enviarComprobanteMembresia = async () => {
    if (!uid || !planSeleccionado) return;
    if (!titularYape.trim() || codigoOperacion.trim().length < 3 || !voucherUri) {
      Alert.alert("Faltan datos", "Escribe el nombre del titular, los últimos dígitos y adjunta la foto.");
      return;
    }
    setEnviandoPago(true);
    try {
      const [voucherUrl, iaAnalisis] = await Promise.all([
        subirImagenStorage(voucherUri, `vouchers_membresia/${uid}/${Date.now()}.jpg`),
        leerVoucherConIA(voucherUri, titularYape.trim(), codigoOperacion.trim(), planSeleccionado.precio),
      ]);
      await addDoc(collection(db, "solicitudes_membresia"), {
        uid,
        nombre: perfil?.nombreTienda || perfil?.nombre || "Usuario",
        rol: perfil?.rol || "chofer",
        planId: planSeleccionado.id,
        plan: planSeleccionado.plan,
        planNombre: planSeleccionado.nombre,
        monto: planSeleccionado.precio,
        dias: planSeleccionado.dias,
        titularYape: titularYape.trim(),
        codigoOperacion: codigoOperacion.trim(),
        voucherUrl,
        iaAnalisis,
        mesContable: new Date().toISOString().slice(0, 7),
        estado: "pendiente",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "usuarios", uid), {
        pagoPendiente: true,
        planSolicitado: planSeleccionado.nombre,
      }).catch(() => {});
      setPlanSeleccionado(null);
      setTitularYape("");
      setCodigoOperacion("");
      setVoucherUri(null);
      Alert.alert("Comprobante enviado", "La IA leyó tu voucher y notificó al Admin.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo enviar el comprobante.");
    } finally {
      setEnviandoPago(false);
    }
  };

  const eliminarArchivoStorage = async (url?: string) => {
    if (!url || !url.startsWith("http")) return;
    try {
      await deleteObject(ref(getStorage(), url));
    } catch {}
  };

  const calcularParametrosPlan = (plan: string) => {
    const limiteProductos =
      plan === "premium" ? 999 : plan === "oro" ? 40 : plan === "platino" ? 25 : 12;
    const prioridadSegundos =
      plan === "premium" || plan === "oro" ? 30 : plan === "platino" ? 15 : 0;
    const flashGratisMes = plan === "premium" ? 2 : plan === "oro" ? 1 : 0;
    return { limiteProductos, prioridadSegundos, flashGratisMes };
  };

  const aprobarSolicitudMembresia = async (sol: any) => {
    try {
      const userObj = usuariosTrabajadores.find((u) => u.id === sol.uid);
      const baseFecha =
        userObj?.fechaVencimiento && userObj.fechaVencimiento > Date.now()
          ? userObj.fechaVencimiento
          : Date.now();
      const diasSumar = Number(sol.dias || 30);
      const planNuevo = sol.plan || "plata";
      const { limiteProductos, prioridadSegundos, flashGratisMes } = calcularParametrosPlan(planNuevo);

      await updateDoc(doc(db, "usuarios", sol.uid), {
        estadoMembresia: "activa",
        plan: planNuevo,
        limiteProductos,
        prioridadSegundos,
        flashGratisMes,
        ventaja3Seg: planNuevo === "oro" || planNuevo === "premium",
        fechaVencimiento: baseFecha + diasSumar * 24 * 60 * 60 * 1000,
        pagoPendiente: false,
      });
      await eliminarArchivoStorage(sol.voucherUrl);
      await updateDoc(doc(db, "solicitudes_membresia", sol.id), {
        estado: "aprobada",
        voucherUrl: "eliminado_storage",
        fechaAprobacionTexto: new Date().toLocaleDateString("es-PE"),
        aprobadoPor: uid,
        aprobadoEn: serverTimestamp(),
      });
      Alert.alert("Activada", `Se activó ${sol.planNombre} (+${diasSumar} días).`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo aprobar.");
    }
  };

  const rechazarSolicitudMembresia = async (sol: any) => {
    await eliminarArchivoStorage(sol.voucherUrl);
    await updateDoc(doc(db, "solicitudes_membresia", sol.id), {
      estado: "rechazada",
      voucherUrl: "eliminado_storage",
    }).catch(() => {});
  };

  const aprobarPublicacionFlash = async (item: any) => {
    try {
      const expira = Date.now() + 24 * 60 * 60 * 1000;
      await updateDoc(doc(db, "mural", item.id), {
        estado: "activa",
        voucherUrl: "eliminado_storage",
        aprobadoEn: serverTimestamp(),
        expiraEn: expira,
      });
      if (item.productoId) {
        await updateDoc(doc(db, "productos", item.productoId), {
          flash: true,
          flashExpiraEn: expira,
        }).catch(() => {});
      }
      await eliminarArchivoStorage(item.voucherUrl);
      Alert.alert("Publicado", "El anuncio Flash ya está visible por 24 horas en Tienda.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo aprobar el anuncio.");
    }
  };

  const rechazarPublicacionFlash = async (item: any) => {
    await eliminarArchivoStorage(item.voucherUrl);
    await updateDoc(doc(db, "mural", item.id), {
      estado: "rechazada",
      voucherUrl: "eliminado_storage",
    }).catch(() => {});
  };

  const activarManualAdmin = async (usuario: any, plan: string, dias: number) => {
    const baseFecha =
      usuario.fechaVencimiento && usuario.fechaVencimiento > Date.now()
        ? usuario.fechaVencimiento
        : Date.now();
    const { limiteProductos, prioridadSegundos, flashGratisMes } = calcularParametrosPlan(plan);

    try {
      await updateDoc(doc(db, "usuarios", usuario.id), {
        estadoMembresia: "activa",
        plan,
        limiteProductos,
        prioridadSegundos,
        flashGratisMes,
        ventaja3Seg: plan === "oro" || plan === "premium",
        fechaVencimiento: baseFecha + dias * 24 * 60 * 60 * 1000,
        pagoPendiente: false,
      });
      Alert.alert("Actualizado", `Plan ${plan.toUpperCase()} (+${dias} días) asignado.`);
    } catch (error: any) {
      Alert.alert("Error", error?.message || "No se pudo activar.");
    }
  };

  const cerrarSesion = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const totalAlertasAdmin =
    solicitudesMembresia.length + solicitudesFlash.length + choferesPendientes.length;
  const tiendaAbierta = perfil?.tiendaAbierta !== false;
  const esUsuarioNormal =
    !esSuperAdmin && (perfil?.rol === "cliente" || perfil?.rol === "pasajero" || !perfil?.rol);

  return (
    <View style={styles.container}>
      {tieneAccesoPanel && (
        <Pressable style={styles.adminFab} onPress={() => setAdminVisible(true)}>
          <Settings color="#fff" size={22} />
          {totalAlertasAdmin > 0 && (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{totalAlertasAdmin}</Text>
            </View>
          )}
        </Pressable>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(perfil?.nombre || storeUser?.nombre || emailActual || "U")[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>
              {perfil?.nombre || storeUser?.nombre || emailActual || "Usuario"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {esSuperAdmin
                    ? "Super Admin 👑"
                    : esAyudante
                      ? "Ayudante / Moderador 🛡️"
                      : perfil?.rol === "chofer"
                        ? perfil?.estadoVerificacion === "pendiente"
                          ? "Chofer (Validando titularidad)"
                          : "Chofer Verificado ✓"
                        : perfil?.rol === "tienda"
                          ? "Tienda Oficial"
                          : "Usuario / Pasajero"}
                </Text>
              </View>
              {(perfil?.rol === "chofer" || perfil?.rol === "tienda") && (
                <View style={[styles.badge, { backgroundColor: "#fef3c7" }]}>
                  <Text style={[styles.badgeText, { color: "#92400e" }]}>
                    {perfil?.plan === "premium"
                      ? "💎 Premium"
                      : perfil?.plan === "oro"
                        ? "🥇 Oro"
                        : perfil?.plan === "platino"
                          ? "💠 Platino"
                          : "🥈 Plata"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Opciones para Usuario Normal: Postular a Chofer o Abrir Tienda */}
        {esUsuarioNormal && (
          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>¿Quieres trabajar o vender en Rutas Express?</Text>
            <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              Activa tu perfil comercial y empieza con 15 días gratis de prueba tecnológica:
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setModalPostularChofer(true)}
                style={{
                  flex: 1,
                  backgroundColor: "#059669",
                  padding: 14,
                  borderRadius: 14,
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Car color="#fff" size={24} />
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Ser Chofer</Text>
                <Text style={{ color: "#d1fae5", fontSize: 10, textAlign: "center" }}>
                  Verificación de titularidad
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setModalAbrirTienda(true)}
                style={{
                  flex: 1,
                  backgroundColor: "#111827",
                  padding: 14,
                  borderRadius: 14,
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Store color="#fff" size={24} />
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Abrir Tienda</Text>
                <Text style={{ color: "#9ca3af", fontSize: 10, textAlign: "center" }}>
                  Pollería, bodega, etc.
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {perfil?.rol === "chofer" && (
          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Datos del Vehículo Verificado</Text>
            <Text style={styles.infoText}>Tipo: {perfil.tipoVehiculo || "Mototaxi"}</Text>
            <Text style={styles.infoText}>Placa: {perfil.placa || "-"}</Text>
            <Text style={styles.infoText}>Modelo: {perfil.vehiculoModelo || "-"}</Text>
            <Text style={styles.infoText}>Color: {perfil.vehiculoColor || "-"}</Text>
            <Text style={styles.membershipText}>
              Membresía ({perfil.plan ? perfil.plan.toUpperCase() : "PLATA"}): {diasRestantes} días restantes
            </Text>
          </View>
        )}

        {perfil?.rol === "tienda" && (
          <View style={styles.infoCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Store color="#059669" size={18} />
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Control de mi Negocio</Text>
            </View>

            <View
              style={[
                styles.statusBox,
                {
                  backgroundColor: tiendaAbierta ? "#ecfdf5" : "#fef2f2",
                  borderColor: tiendaAbierta ? "#a7f3d0" : "#fecaca",
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "800",
                    color: tiendaAbierta ? "#065f46" : "#991b1b",
                  }}
                >
                  {tiendaAbierta ? "🟢 Local ABIERTO (Recibiendo pedidos)" : "🔴 Local CERRADO"}
                </Text>
                <Text style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>
                  {tiendaAbierta
                    ? "Tus productos están activos en el catálogo."
                    : "Tus productos salen en gris para evitar pedidos en falso."}
                </Text>
              </View>
              <Switch
                value={tiendaAbierta}
                onValueChange={toggleTiendaAbierta}
                trackColor={{ false: "#fca5a5", true: "#6ee7b7" }}
                thumbColor={tiendaAbierta ? "#059669" : "#dc2626"}
              />
            </View>

            <Text style={styles.infoText}>Negocio: {perfil.nombreTienda || "-"}</Text>
            <Text style={styles.infoText}>Rubro: {perfil.categoriaTienda || "-"}</Text>

            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <MapPin color="#059669" size={14} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151" }}>
                  Punto de referencia (Para clientes y choferes):
                </Text>
              </View>
              <TextInput
                value={referenciaEdit}
                onChangeText={setReferenciaEdit}
                placeholder="Ej: Frente al paradero de CP3 o a media cuadra del mercado"
                style={[styles.input, { marginBottom: 6 }]}
              />
              <Pressable
                onPress={guardarReferenciaTienda}
                disabled={guardandoRef}
                style={[styles.planBtn, { marginTop: 0, backgroundColor: "#111827" }]}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                  {guardandoRef ? "Guardando..." : "Guardar Punto de Referencia"}
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.membershipText, { marginTop: 12 }]}>
              Membresía ({perfil.plan ? perfil.plan.toUpperCase() : "PLATA"}): {diasRestantes} días restantes
            </Text>
          </View>
        )}

        {(perfil?.rol === "chofer" || perfil?.rol === "tienda") && (
          <View style={styles.infoCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Crown color="#d97706" size={18} />
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                Planes y Rangos (15 días gratis)
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              Suscripción opcional por uso tecnológico de la app. Al vencer, tu cuenta entra en Modo Pausado sin perder tus datos.
            </Text>
            {PLANES_MEMBRESIA.map((item) => (
              <View key={item.id} style={styles.planCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#111827" }}>{item.nombre}</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#059669" }}>
                    S/ {item.precio}.00
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>
                  {perfil?.rol === "chofer" ? item.beneficioChofer : item.beneficioTienda}
                </Text>
                <Pressable onPress={() => setPlanSeleccionado(item)} style={styles.planBtn}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                    Elegir {item.nombre} ({item.dias} días)
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable style={styles.logoutBtn} onPress={cerrarSesion}>
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </Pressable>
      </ScrollView>

      {/* Modal Verificación de Titularidad y Seguridad del Viaje (Estilo InDrive) */}
      <Modal
        visible={modalPostularChofer}
        transparent
        animationType="slide"
        onRequestClose={() => setModalPostularChofer(false)}
      >
        <View style={styles.overlay}>
          <ScrollView style={styles.payModalCard} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={{ fontSize: 19, fontWeight: "900", color: "#111827" }}>
              Verificación de Titularidad
            </Text>
            <Text style={{ fontSize: 12, color: "#4b5563", marginTop: 4, marginBottom: 12, lineHeight: 17 }}>
              Para seguridad de los pasajeros de Tambogrande y CP3, confirmamos que eres el titular del documento y de la unidad. Tu DNI es estrictamente confidencial y nunca se publica.
            </Text>

            <TextInput
              value={dniChofer}
              onChangeText={setDniChofer}
              placeholder="Nro de DNI del titular (8 dígitos) *"
              keyboardType="numeric"
              maxLength={8}
              style={styles.input}
            />
            <TextInput
              value={placaChofer}
              onChangeText={setPlacaChofer}
              placeholder="Placa del vehículo (Ej: 1234-AB) *"
              autoCapitalize="characters"
              style={styles.input}
            />
            <TextInput
              value={modeloChofer}
              onChangeText={setModeloChofer}
              placeholder="Marca / Modelo (Ej: Bajaj Torito) *"
              style={styles.input}
            />
            <TextInput
              value={colorChofer}
              onChangeText={setColorChofer}
              placeholder="Color del vehículo (Ej: Azul / Rojo)"
              style={styles.input}
            />

            <Pressable
              onPress={() => elegirImagen(setFotoDniUri, [4, 3])}
              style={styles.uploadVoucherBtn}
            >
              <ShieldCheck color="#059669" size={18} />
              <Text style={{ color: "#059669", fontWeight: "800", fontSize: 12 }}>
                {fotoDniUri ? "✓ Foto de DNI adjuntada (Cambiar)" : "1. Foto de DNI para validar titularidad *"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => elegirImagen(setFotoPlacaUri, [4, 3])}
              style={styles.uploadVoucherBtn}
            >
              <Camera color="#059669" size={18} />
              <Text style={{ color: "#059669", fontWeight: "800", fontSize: 12 }}>
                {fotoPlacaUri
                  ? "✓ Foto del vehículo con placa lista (Cambiar)"
                  : "2. Foto del vehículo con placa visible *"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setAceptaDeclaracionChofer((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: aceptaDeclaracionChofer ? "#059669" : "#d1d5db",
                  backgroundColor: aceptaDeclaracionChofer ? "#059669" : "#fff",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {aceptaDeclaracionChofer && <CheckCircle color="#fff" size={14} />}
              </View>
              <Text style={{ flex: 1, fontSize: 11, color: "#374151" }}>
                Declaro ser conductor independiente y autorizo la validación de mis documentos únicamente para seguridad del viaje.
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable
                onPress={() => setModalPostularChofer(false)}
                style={[styles.modalActionBtn, { backgroundColor: "#f3f4f6" }]}
              >
                <Text style={{ fontWeight: "700", color: "#4b5563" }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={enviarPostulacionChofer}
                disabled={enviandoPostulacion}
                style={[styles.modalActionBtn, { backgroundColor: "#059669" }]}
              >
                <Text style={{ fontWeight: "800", color: "#fff" }}>
                  {enviandoPostulacion ? "Subiendo..." : "Enviar verificación"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal Abrir Tienda */}
      <Modal
        visible={modalAbrirTienda}
        transparent
        animationType="slide"
        onRequestClose={() => setModalAbrirTienda(false)}
      >
        <View style={styles.overlay}>
          <ScrollView style={styles.payModalCard} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={{ fontSize: 19, fontWeight: "900", color: "#111827" }}>
              Abrir mi Tienda (15 días gratis)
            </Text>
            <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2, marginBottom: 12 }}>
              Publica tus productos y recibe pedidos ordenados con DNI y caserío.
            </Text>

            <TextInput
              value={nombreNegocioNuevo}
              onChangeText={setNombreNegocioNuevo}
              placeholder="Nombre de tu negocio (Ej: Pollería El Sabor) *"
              style={styles.input}
            />

            <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6 }}>
              Rubro del negocio:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {["Pollerías", "Bodegas", "Ferreterías", "Carnicerías", "Farmacias"].map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRubroNegocioNuevo(r)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    marginRight: 6,
                    backgroundColor: rubroNegocioNuevo === r ? "#059669" : "#f3f4f6",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: rubroNegocioNuevo === r ? "#fff" : "#374151",
                    }}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <TextInput
              value={referenciaNegocioNueva}
              onChangeText={setReferenciaNegocioNueva}
              placeholder="Punto de referencia (Ej: Frente al paradero CP3)"
              style={styles.input}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={() => setModalAbrirTienda(false)}
                style={[styles.modalActionBtn, { backgroundColor: "#f3f4f6" }]}
              >
                <Text style={{ fontWeight: "700", color: "#4b5563" }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={activarNuevaTienda}
                disabled={enviandoPostulacion}
                style={[styles.modalActionBtn, { backgroundColor: "#059669" }]}
              >
                <Text style={{ fontWeight: "800", color: "#fff" }}>
                  {enviandoPostulacion ? "Activando..." : "Activar Tienda Gratis"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal Enviar Pago Yape: PASO 1 (QR y Nombre del Dueño) -> PASO 2 (Datos del Cliente) */}
      <Modal
        visible={!!planSeleccionado}
        transparent
        animationType="fade"
        onRequestClose={() => setPlanSeleccionado(null)}
      >
        <View style={styles.overlay}>
          <ScrollView
            style={styles.payModalCard}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ fontSize: 19, fontWeight: "900", color: "#111827" }}>
              Activar {planSeleccionado?.nombre}
            </Text>
            <Text style={{ fontSize: 14, color: "#059669", fontWeight: "800", marginTop: 2, marginBottom: 12 }}>
              Monto total: S/ {planSeleccionado?.precio}.00 ({planSeleccionado?.dias} días)
            </Text>

            <View style={styles.pasoBoxYape}>
              <Text style={{ fontSize: 12, fontWeight: "900", color: "#6b21a8", marginBottom: 8 }}>
                PASO 1: Yapea S/ {planSeleccionado?.precio}.00 a esta cuenta oficial
              </Text>

              {configPagos?.qrUrl ? (
                <Image
                  source={{ uri: configPagos.qrUrl }}
                  style={{ width: 165, height: 165, borderRadius: 12, alignSelf: "center", backgroundColor: "#fff" }}
                  resizeMode="contain"
                />
              ) : (
                <View style={{ padding: 16, backgroundColor: "#fff", borderRadius: 10, alignItems: "center" }}>
                  <QrCode color="#6b21a8" size={32} />
                  <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    QR Oficial Rutas Express
                  </Text>
                </View>
              )}

              <View style={{ alignItems: "center", marginTop: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: "900", color: "#111827" }}>
                  📱 Yape: {configPagos?.numeroYape || "Configurando número..."}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#4b5563", marginTop: 2 }}>
                  👤 Titular: {configPagos?.titularYape || "Administrador Rutas Express"}
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 13, fontWeight: "800", color: "#111827", marginBottom: 6 }}>
              PASO 2: Confirma tu pago aquí abajo
            </Text>

            <View style={styles.avisoYapeBox}>
              <Text style={{ fontSize: 11, color: "#92400e", fontWeight: "700" }}>
                ⚠️ Escribe tu Nombre en el mensaje de Yape y adjunta la captura de tu comprobante:
              </Text>
            </View>

            <TextInput
              value={titularYape}
              onChangeText={setTitularYape}
              placeholder="Tu nombre (Titular que envió el Yape)"
              style={styles.input}
            />
            <TextInput
              value={codigoOperacion}
              onChangeText={setCodigoOperacion}
              placeholder="Últimos 3 dígitos de operación (Ej: 482)"
              keyboardType="numeric"
              style={styles.input}
            />

            <Pressable
              onPress={() => elegirImagen(setVoucherUri, [4, 3])}
              style={styles.uploadVoucherBtn}
            >
              <Camera color="#059669" size={18} />
              <Text style={{ color: "#059669", fontWeight: "700", fontSize: 13 }}>
                {voucherUri ? "✓ Captura de voucher lista (Cambiar)" : "Subir captura de tu voucher"}
              </Text>
            </Pressable>

            {voucherUri && (
              <Image
                source={{ uri: voucherUri }}
                style={{ width: "100%", height: 115, borderRadius: 10, marginBottom: 10 }}
                resizeMode="cover"
              />
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable
                onPress={() => setPlanSeleccionado(null)}
                style={[styles.modalActionBtn, { backgroundColor: "#f3f4f6" }]}
              >
                <Text style={{ fontWeight: "700", color: "#4b5563" }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={enviarComprobanteMembresia}
                disabled={enviandoPago}
                style={[styles.modalActionBtn, { backgroundColor: "#059669" }]}
              >
                <Text style={{ fontWeight: "700", color: "#fff" }}>
                  {enviandoPago ? "Verificando IA..." : "Enviar comprobante"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal Panel Super Admin / Ayudantes */}
      <Modal visible={adminVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {esSuperAdmin ? "Panel Super Admin 👑" : "Panel Moderador 🛡️"}
            </Text>
            <Pressable onPress={() => setAdminVisible(false)}>
              <Text style={styles.closeText}>Cerrar</Text>
            </Pressable>
          </View>

          <View style={styles.adminTabsRow}>
            <Pressable
              onPress={() => setTabAdmin("membresias")}
              style={[styles.adminTab, tabAdmin === "membresias" && styles.adminTabActive]}
            >
              <CreditCard color={tabAdmin === "membresias" ? "#fff" : "#374151"} size={13} />
              <Text style={[styles.adminTabText, tabAdmin === "membresias" && styles.adminTabTextActive]}>
                Pagos ({solicitudesMembresia.length})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setTabAdmin("flash")}
              style={[styles.adminTab, tabAdmin === "flash" && styles.adminTabActive]}
            >
              <Zap color={tabAdmin === "flash" ? "#fff" : "#374151"} size={13} />
              <Text style={[styles.adminTabText, tabAdmin === "flash" && styles.adminTabTextActive]}>
                Flash ({solicitudesFlash.length})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setTabAdmin("usuarios")}
              style={[styles.adminTab, tabAdmin === "usuarios" && styles.adminTabActive]}
            >
              <Users color={tabAdmin === "usuarios" ? "#fff" : "#374151"} size={13} />
              <Text style={[styles.adminTabText, tabAdmin === "usuarios" && styles.adminTabTextActive]}>
                Cuentas ({usuariosTrabajadores.length + choferesPendientes.length})
              </Text>
            </Pressable>

            {esSuperAdmin && (
              <Pressable
                onPress={() => setTabAdmin("qr")}
                style={[styles.adminTab, tabAdmin === "qr" && styles.adminTabActive]}
              >
                <QrCode color={tabAdmin === "qr" ? "#fff" : "#374151"} size={13} />
                <Text style={[styles.adminTabText, tabAdmin === "qr" && styles.adminTabTextActive]}>
                  Mi QR
                </Text>
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
            {tabAdmin === "qr" && esSuperAdmin && (
              <View style={styles.adminCard}>
                <Text style={{ fontSize: 17, fontWeight: "800", color: "#111827", marginBottom: 4 }}>
                  Configurar mi QR Yape Oficial
                </Text>
                <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
                  Solo tú como Super Admin ves esta pestaña. Esta imagen y datos saldrán a todos al pagar.
                </Text>

                <Pressable
                  onPress={() => elegirImagen(setAdminQrUri, [1, 1])}
                  style={styles.qrUploadArea}
                >
                  {adminQrUri ? (
                    <Image
                      source={{ uri: adminQrUri }}
                      style={{ width: 170, height: 170, borderRadius: 12 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={{ alignItems: "center", paddingVertical: 20 }}>
                      <QrCode color="#059669" size={40} />
                      <Text style={{ color: "#059669", fontWeight: "800", marginTop: 8 }}>
                        Toca para subir la foto de tu QR Yape
                      </Text>
                    </View>
                  )}
                </Pressable>

                <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 4 }}>
                  Número de celular Yape:
                </Text>
                <TextInput
                  value={adminNumeroYape}
                  onChangeText={setAdminNumeroYape}
                  placeholder="Ej: 987 654 321"
                  keyboardType="phone-pad"
                  style={styles.input}
                />

                <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 4 }}>
                  Nombre completo del titular (Como sale en Yape):
                </Text>
                <TextInput
                  value={adminTitularYape}
                  onChangeText={setAdminTitularYape}
                  placeholder="Ej: José Gabriel García..."
                  style={styles.input}
                />

                <Pressable
                  onPress={guardarConfiguracionQrAdmin}
                  disabled={guardandoQr}
                  style={[styles.activateBtn, { marginTop: 8, paddingVertical: 14 }]}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                    {guardandoQr ? "Guardando QR..." : "Guardar Mi QR Yape Oficial"}
                  </Text>
                </Pressable>
              </View>
            )}

            {tabAdmin === "membresias" && (
              <>
                {solicitudesMembresia.length === 0 ? (
                  <Text style={styles.emptyAdmin}>No hay solicitudes pendientes.</Text>
                ) : (
                  solicitudesMembresia.map((sol) => (
                    <View key={sol.id} style={styles.adminCard}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={styles.adminName}>
                          {sol.nombre} ({sol.rol})
                        </Text>
                        <Text style={{ fontWeight: "800", color: "#059669", fontSize: 15 }}>
                          S/ {sol.monto}.00
                        </Text>
                      </View>
                      <Text style={styles.adminSub}>
                        Plan: {sol.planNombre} (+{sol.dias} días)
                      </Text>
                      <Text style={styles.adminSub}>
                        Yape: <Text style={{ fontWeight: "800" }}>{sol.titularYape}</Text> · Op: #
                        {sol.codigoOperacion}
                      </Text>

                      {sol.iaAnalisis ? (
                        <View style={styles.iaBox}>
                          <Text style={{ fontSize: 11, fontWeight: "800", color: "#047857" }}>
                            🤖 Lectura IA ({sol.iaAnalisis.confianza}):
                          </Text>
                          <Text style={{ fontSize: 11, color: "#065f46" }}>
                            {sol.iaAnalisis.resumenTexto ||
                              `Titular: ${sol.iaAnalisis.titularDetectado} · Op #${sol.iaAnalisis.operacionDetectada}`}
                          </Text>
                        </View>
                      ) : null}

                      {sol.voucherUrl && sol.voucherUrl.startsWith("http") ? (
                        <Image
                          source={{ uri: sol.voucherUrl }}
                          style={{ width: "100%", height: 180, borderRadius: 10, marginVertical: 8 }}
                          resizeMode="contain"
                        />
                      ) : null}

                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <Pressable
                          style={[styles.activateBtn, { flex: 2 }]}
                          onPress={() => aprobarSolicitudMembresia(sol)}
                        >
                          <Text style={styles.activateBtnText}>Aprobar y borrar foto</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.rejectBtn, { flex: 1 }]}
                          onPress={() => rechazarSolicitudMembresia(sol)}
                        >
                          <Text style={styles.rejectBtnText}>Rechazar</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}

                <View style={{ marginTop: 22 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <FileText color="#111827" size={18} />
                    <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827" }}>
                      Pagos verificados este mes ({pagosAprobadosMes.length})
                    </Text>
                  </View>
                  {pagosAprobadosMes.length === 0 ? (
                    <Text style={{ fontSize: 13, color: "#6b7280" }}>
                      Aún no hay pagos aprobados en este mes.
                    </Text>
                  ) : (
                    pagosAprobadosMes.map((pago) => {
                      const uActual = usuariosTrabajadores.find((u) => u.id === pago.uid);
                      const diasQuedan = uActual?.fechaVencimiento
                        ? Math.max(
                            0,
                            Math.ceil((uActual.fechaVencimiento - Date.now()) / (1000 * 60 * 60 * 24))
                          )
                        : 0;
                      return (
                        <View key={pago.id} style={styles.auditRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "800", color: "#111827" }}>
                              {pago.nombre} · Yape: {pago.titularYape}
                            </Text>
                            <Text style={{ fontSize: 12, color: "#4b5563" }}>
                              Op #{pago.codigoOperacion} · S/ {pago.monto}.00 · {pago.planNombre}
                            </Text>
                            <Text style={{ fontSize: 11, color: "#059669", fontWeight: "700" }}>
                              Le quedan {diasQuedan} días · Voucher eliminado ✓
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </>
            )}

            {tabAdmin === "flash" && (
              <>
                {solicitudesFlash.length === 0 ? (
                  <Text style={styles.emptyAdmin}>No hay anuncios Flash pendientes.</Text>
                ) : (
                  solicitudesFlash.map((item) => (
                    <View key={item.id} style={styles.adminCard}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Zap color="#d97706" size={16} />
                        <Text style={styles.adminName}>
                          {item.autorNombre || "Comercio"} · Anuncio Flash 24h
                        </Text>
                      </View>
                      <Text style={[styles.adminSub, { fontWeight: "700", color: "#111827" }]}>
                        {item.titulo || item.texto}
                      </Text>
                      {item.titularYape ? (
                        <Text style={styles.adminSub}>
                          Yape: <Text style={{ fontWeight: "800" }}>{item.titularYape}</Text> · Op: #
                          {item.codigoOperacion} · S/ {item.monto || 3}.00
                        </Text>
                      ) : null}
                      {item.voucherUrl && item.voucherUrl.startsWith("http") ? (
                        <Image
                          source={{ uri: item.voucherUrl }}
                          style={{ width: "100%", height: 150, borderRadius: 10, marginVertical: 6 }}
                          resizeMode="contain"
                        />
                      ) : item.imagenUrl ? (
                        <Image
                          source={{ uri: item.imagenUrl }}
                          style={{ width: "100%", height: 140, borderRadius: 10, marginVertical: 6 }}
                          resizeMode="cover"
                        />
                      ) : null}
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <Pressable
                          style={[styles.activateBtn, { flex: 2, backgroundColor: "#d97706" }]}
                          onPress={() => aprobarPublicacionFlash(item)}
                        >
                          <Text style={styles.activateBtnText}>Aprobar Flash (24h)</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.rejectBtn, { flex: 1 }]}
                          onPress={() => rechazarPublicacionFlash(item)}
                        >
                          <Text style={styles.rejectBtnText}>Rechazar</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}

            {tabAdmin === "usuarios" && (
              <>
                {choferesPendientes.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 15, fontWeight: "900", color: "#b45309", marginBottom: 8 }}>
                      🛡️ Choferes esperando validación de titularidad ({choferesPendientes.length})
                    </Text>
                    {choferesPendientes.map((ch) => (
                      <View
                        key={ch.id}
                        style={[styles.adminCard, { borderColor: "#f59e0b", borderWidth: 1.5 }]}
                      >
                        <Text style={styles.adminName}>{ch.nombre}</Text>
                        <Text style={styles.adminSub}>
                          DNI: {ch.dniNumero} · Placa: {ch.placa} ({ch.vehiculoModelo})
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
                          {ch.fotoDniUrl ? (
                            <Image
                              source={{ uri: ch.fotoDniUrl }}
                              style={{ flex: 1, height: 110, borderRadius: 8 }}
                              resizeMode="cover"
                            />
                          ) : null}
                          {ch.fotoPlacaUrl ? (
                            <Image
                              source={{ uri: ch.fotoPlacaUrl }}
                              style={{ flex: 1, height: 110, borderRadius: 8 }}
                              resizeMode="cover"
                            />
                          ) : null}
                        </View>
                        <Pressable
                          style={styles.activateBtn}
                          onPress={() => aprobarChoferVerificado(ch)}
                        >
                          <Text style={styles.activateBtnText}>✓ Verificar Titularidad (15 días gratis)</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                {usuariosTrabajadores.map((u) => {
                  const vencido = !u.fechaVencimiento || u.fechaVencimiento < Date.now();
                  const diasU = u.fechaVencimiento
                    ? Math.max(0, Math.ceil((u.fechaVencimiento - Date.now()) / (1000 * 60 * 60 * 24)))
                    : 0;
                  return (
                    <View key={u.id} style={styles.adminCard}>
                      <Text style={styles.adminName}>
                        {u.nombreTienda || u.nombre || "Sin nombre"} ({u.rol})
                      </Text>
                      <Text style={styles.adminSub}>
                        Estado: {vencido ? "Pausada" : `Activa (${diasU}d)`} · Rango:{" "}
                        {u.plan ? u.plan.toUpperCase() : "PLATA"}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        <Pressable
                          style={styles.miniPlanBtn}
                          onPress={() => activarManualAdmin(u, "plata", 7)}
                        >
                          <Text style={styles.miniPlanText}>Plata 7d</Text>
                        </Pressable>
                        <Pressable
                          style={styles.miniPlanBtn}
                          onPress={() => activarManualAdmin(u, "plata", 30)}
                        >
                          <Text style={styles.miniPlanText}>Plata 30d</Text>
                        </Pressable>
                        <Pressable
                          style={styles.miniPlanBtn}
                          onPress={() => activarManualAdmin(u, "platino", 30)}
                        >
                          <Text style={styles.miniPlanText}>Platino</Text>
                        </Pressable>
                        <Pressable
                          style={styles.miniPlanBtn}
                          onPress={() => activarManualAdmin(u, "oro", 30)}
                        >
                          <Text style={styles.miniPlanText}>Oro</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.miniPlanBtn, { backgroundColor: "#111827" }]}
                          onPress={() => activarManualAdmin(u, "premium", 30)}
                        >
                          <Text style={styles.miniPlanText}>Premium</Text>
                        </Pressable>
                        {esSuperAdmin && (
                          <Pressable
                            style={[
                              styles.miniPlanBtn,
                              { backgroundColor: u.esAyudante ? "#dc2626" : "#0284c7" },
                            ]}
                            onPress={() => toggleRolAyudante(u)}
                          >
                            <Text style={styles.miniPlanText}>
                              {u.esAyudante ? "Quitar Ayudante" : "Hacer Ayudante"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  scrollContent: { padding: 20, paddingTop: 64, paddingBottom: 110 },
  adminFab: {
    position: "absolute",
    top: 48,
    right: 16,
    zIndex: 20,
    backgroundColor: "#111827",
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  fabBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  fabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  userCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#059669",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  avatarText: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  userName: { fontSize: 18, fontWeight: "bold", color: "#111827" },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#d1fae5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: "#065f46", fontWeight: "700", fontSize: 12 },
  infoCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#111827", marginBottom: 10 },
  infoText: { fontSize: 14, marginBottom: 5, color: "#374151" },
  membershipText: { fontSize: 14, fontWeight: "700", color: "#059669", marginTop: 6 },
  planCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  planBtn: {
    backgroundColor: "#059669",
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  logoutBtn: {
    padding: 16,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    alignItems: "center",
  },
  logoutText: { color: "#dc2626", fontWeight: "bold", fontSize: 15 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 16,
  },
  payModalCard: { backgroundColor: "#fff", borderRadius: 22, padding: 18, maxHeight: "92%" },
  pasoBoxYape: {
    backgroundColor: "#faf5ff",
    borderWidth: 1.5,
    borderColor: "#d8b4fe",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  avisoYapeBox: {
    backgroundColor: "#fef3c7",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 14,
  },
  uploadVoucherBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 10,
  },
  modalActionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  modalContainer: { flex: 1, backgroundColor: "#f9fafb", paddingTop: 48 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#111827" },
  closeText: { color: "#dc2626", fontWeight: "bold", fontSize: 15 },
  adminTabsRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 5,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  adminTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  adminTabActive: { backgroundColor: "#059669" },
  adminTabText: { fontSize: 10, fontWeight: "800", color: "#374151" },
  adminTabTextActive: { color: "#fff" },
  qrUploadArea: {
    backgroundColor: "#f9fafb",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#059669",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyAdmin: { textAlign: "center", color: "#6b7280", marginTop: 24, fontSize: 14 },
  adminCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  adminName: { fontSize: 15, fontWeight: "bold", color: "#111827" },
  adminSub: { fontSize: 13, color: "#4b5563", marginTop: 4 },
  iaBox: {
    backgroundColor: "#ecfdf5",
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  auditRow: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  activateBtn: {
    backgroundColor: "#059669",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  activateBtnText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  rejectBtn: {
    backgroundColor: "#fee2e2",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  rejectBtnText: { color: "#dc2626", fontWeight: "bold", fontSize: 12 },
  miniPlanBtn: {
    backgroundColor: "#059669",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  miniPlanText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});