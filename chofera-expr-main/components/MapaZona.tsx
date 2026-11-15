import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Coordenada } from '@/types';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export interface MotoCercana {
  id: string;
  nombre?: string;
  latitude: number;
  longitude: number;
}

const TAMBOGRANDE_DEFAULT: Coordenada = {
  latitude: -5.0561,
  longitude: -80.3472,
};

function esCoordValida(
  c?: { latitude?: number; longitude?: number } | null
): c is Coordenada {
  return Boolean(
    c &&
      typeof c.latitude === 'number' &&
      typeof c.longitude === 'number' &&
      (Math.abs(c.latitude) > 0.05 || Math.abs(c.longitude) > 0.05)
  );
}

function buildLeafletHtml(
  lat: number,
  lng: number,
  interactivo: boolean,
  capaInicial: 'satelite' | 'calles'
) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #e5e7eb; }
    .leaflet-control-attribution { display: none !important; }

    .radar-wrap { position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
    .radar-ring {
      position: absolute; width: 44px; height: 44px; border-radius: 50%;
      background: rgba(16, 185, 129, 0.35);
      animation: pulseRadar 2s infinite ease-out;
    }
    .radar-dot {
      width: 16px; height: 16px; border-radius: 50%;
      background: #059669; border: 3px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45); z-index: 2;
    }
    @keyframes pulseRadar {
      0% { transform: scale(0.35); opacity: 0.9; }
      100% { transform: scale(1.45); opacity: 0; }
    }

    .pin-label {
      color: #fff; font-size: 11px; font-weight: 800;
      padding: 4px 9px; border-radius: 12px; white-space: nowrap;
      border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.45);
      display: inline-flex; align-items: center; gap: 4px;
    }
    .pin-origen { background: #059669; }
    .pin-destino { background: #dc2626; }
    .pin-chofer { background: #f59e0b; color: #111827; }

    .moto-badge {
      background: #ffffff; border: 2px solid #059669; border-radius: 16px;
      padding: 2px 6px; font-size: 14px; box-shadow: 0 3px 8px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true
    }).setView([${lat}, ${lng}], 16);

    var sateliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    );
    var etiquetasLayer = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    );
    var callesLayer = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19 }
    );

    var modoActual = '${capaInicial}';
    if (modoActual === 'satelite') {
      sateliteLayer.addTo(map);
      etiquetasLayer.addTo(map);
    } else {
      callesLayer.addTo(map);
    }

    window.cambiarCapa = function(modo) {
      if (modo === modoActual) return;
      modoActual = modo;
      if (modo === 'satelite') {
        map.removeLayer(callesLayer);
        sateliteLayer.addTo(map);
        etiquetasLayer.addTo(map);
      } else {
        map.removeLayer(sateliteLayer);
        map.removeLayer(etiquetasLayer);
        callesLayer.addTo(map);
      }
    };

    var origenMarker = null;
    var destinoMarker = null;
    var choferMarker = null;
    var rutaLine = null;
    var rutaBorde = null;
    var motosLayer = L.layerGroup().addTo(map);
    var ultimaClaveRuta = '';

    var radarIcon = L.divIcon({
      className: '',
      html: '<div class="radar-wrap"><div class="radar-ring"></div><div class="radar-dot"></div></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    var origenPinIcon = L.divIcon({
      className: '',
      html: '<div class="pin-label pin-origen">📍 Origen</div>',
      iconSize: [96, 28],
      iconAnchor: [48, 14]
    });

    var destinoIcon = L.divIcon({
      className: '',
      html: '<div class="pin-label pin-destino">🏁 Destino</div>',
      iconSize: [88, 28],
      iconAnchor: [44, 14]
    });

    var choferIcon = L.divIcon({
      className: '',
      html: '<div class="pin-label pin-chofer">🛵 Chofer</div>',
      iconSize: [88, 28],
      iconAnchor: [44, 14]
    });

    var motoIcon = L.divIcon({
      className: '',
      html: '<div class="moto-badge">🛵</div>',
      iconSize: [32, 28],
      iconAnchor: [16, 14]
    });

    function esValida(c) {
      return c && typeof c.latitude === 'number' && typeof c.longitude === 'number' &&
        (Math.abs(c.latitude) > 0.05 || Math.abs(c.longitude) > 0.05);
    }

    function dibujarPolilinea(coords, color) {
      if (rutaBorde) map.removeLayer(rutaBorde);
      if (rutaLine) map.removeLayer(rutaLine);
      rutaBorde = L.polyline(coords, {
        color: '#ffffff',
        weight: 8,
        opacity: 0.9
      }).addTo(map);
      rutaLine = L.polyline(coords, {
        color: color || '#10b981',
        weight: 5,
        opacity: 0.98
      }).addTo(map);
    }

    function trazarRutaPorCarretera(inicio, fin, color) {
      var clave = inicio[0].toFixed(4) + ',' + inicio[1].toFixed(4) + '->' + fin[0].toFixed(4) + ',' + fin[1].toFixed(4) + ':' + color;
      if (clave === ultimaClaveRuta && rutaLine) return;
      ultimaClaveRuta = clave;

      // Dibuja línea inmediata mientras consulta la carretera real
      dibujarPolilinea([inicio, fin], color);

      var url = 'https://router.project-osrm.org/route/v1/driving/' +
        inicio[1] + ',' + inicio[0] + ';' + fin[1] + ',' + fin[0] +
        '?overview=full&geometries=geojson';

      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(res) {
          if (res && res.routes && res.routes[0] && res.routes[0].geometry) {
            var coords = res.routes[0].geometry.coordinates.map(function(pt) {
              return [pt[1], pt[0]];
            });
            dibujarPolilinea(coords, color);
          }
        })
        .catch(function() {});
    }

    window.actualizarMapa = function(data) {
      var puntos = [];

      if (esValida(data.origen)) {
        var iconoO = data.usarPinOrigen ? origenPinIcon : radarIcon;
        if (!origenMarker) {
          origenMarker = L.marker([data.origen.latitude, data.origen.longitude], { icon: iconoO }).addTo(map);
        } else {
          origenMarker.setLatLng([data.origen.latitude, data.origen.longitude]);
          origenMarker.setIcon(iconoO);
        }
        puntos.push([data.origen.latitude, data.origen.longitude]);
      } else if (origenMarker) {
        map.removeLayer(origenMarker);
        origenMarker = null;
      }

      if (esValida(data.destino)) {
        if (!destinoMarker) {
          destinoMarker = L.marker([data.destino.latitude, data.destino.longitude], { icon: destinoIcon }).addTo(map);
        } else {
          destinoMarker.setLatLng([data.destino.latitude, data.destino.longitude]);
        }
        puntos.push([data.destino.latitude, data.destino.longitude]);
      } else if (destinoMarker) {
        map.removeLayer(destinoMarker);
        destinoMarker = null;
      }

      if (esValida(data.chofer)) {
        if (!choferMarker) {
          choferMarker = L.marker([data.chofer.latitude, data.chofer.longitude], { icon: choferIcon }).addTo(map);
        } else {
          choferMarker.setLatLng([data.chofer.latitude, data.chofer.longitude]);
        }
        puntos.push([data.chofer.latitude, data.chofer.longitude]);
      } else if (choferMarker) {
        map.removeLayer(choferMarker);
        choferMarker = null;
      }

      if (Array.isArray(data.ruta) && data.ruta.length >= 2) {
        trazarRutaPorCarretera(data.ruta[0], data.ruta[1], data.colorRuta || '#10b981');
      } else {
        ultimaClaveRuta = '';
        if (rutaBorde) { map.removeLayer(rutaBorde); rutaBorde = null; }
        if (rutaLine) { map.removeLayer(rutaLine); rutaLine = null; }
      }

      if (puntos.length >= 2) {
        map.fitBounds(L.latLngBounds(puntos), { padding: [55, 55], maxZoom: 17 });
      } else if (puntos.length === 1) {
        map.flyTo(puntos[0], 16, { duration: 0.5 });
      } else if (esValida(data.center)) {
        map.flyTo([data.center.latitude, data.center.longitude], 16, { duration: 0.5 });
      }

      motosLayer.clearLayers();
      if (Array.isArray(data.motos)) {
        data.motos.forEach(function(m) {
          if (esValida(m)) {
            L.marker([m.latitude, m.longitude], { icon: motoIcon }).addTo(motosLayer);
          }
        });
      }
    };

    ${
      interactivo
        ? `map.on('click', function(e) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                latitude: e.latlng.lat,
                longitude: e.latlng.lng
              }));
            }
          });`
        : ''
    }
  </script>
</body>
</html>`;
}

function SelectorCapa({
  capa,
  onToggle,
}: {
  capa: 'satelite' | 'calles';
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.layerBtn} onPress={onToggle}>
      <Text style={styles.layerBtnText}>
        {capa === 'satelite' ? '🛰️ Satélite | Ver Calles' : '🗺️ Calles | Ver Satélite'}
      </Text>
    </Pressable>
  );
}

export function MapaZona({
  latitude,
  longitude,
  label,
  motos = [],
}: {
  latitude: number;
  longitude: number;
  label: string;
  motos?: MotoCercana[];
}) {
  const webRef = useRef<any>(null);
  const [capa, setCapa] = useState<'satelite' | 'calles'>('satelite');

  const centro = esCoordValida({ latitude, longitude })
    ? { latitude, longitude }
    : TAMBOGRANDE_DEFAULT;

  const html = useMemo(
    () => buildLeafletHtml(centro.latitude, centro.longitude, false, 'satelite'),
    []
  );

  const sincronizar = () => {
    const payload = JSON.stringify({
      center: centro,
      origen: centro,
      usarPinOrigen: false,
      motos,
    });
    webRef.current?.injectJavaScript(`window.actualizarMapa && window.actualizarMapa(${payload}); true;`);
  };

  useEffect(() => {
    sincronizar();
  }, [centro.latitude, centro.longitude, motos]);

  const toggleCapa = () => {
    const siguiente = capa === 'satelite' ? 'calles' : 'satelite';
    setCapa(siguiente);
    webRef.current?.injectJavaScript(`window.cambiarCapa && window.cambiarCapa('${siguiente}'); true;`);
  };

  return (
    <View style={styles.wrapper}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.webview}
        onLoadEnd={sincronizar}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
      />
      <SelectorCapa capa={capa} onToggle={toggleCapa} />
      <View style={styles.radarPill}>
        <View style={styles.greenDot} />
        <Text style={styles.radarText}>
          {label} • {motos.length} motos activas
        </Text>
      </View>
    </View>
  );
}

export function MapaSelector({
  region,
  origen,
  destino,
  onMapPress,
  onSelect,
  onPressMiUbicacion,
  ubicando = false,
}: {
  region: Region;
  origen?: Coordenada | null;
  destino?: Coordenada | null;
  onMapPress?: (coord: Coordenada) => void;
  onSelect?: (coord: Coordenada) => void;
  onPressMiUbicacion?: () => void;
  ubicando?: boolean;
}) {
  const webRef = useRef<any>(null);
  const [capa, setCapa] = useState<'satelite' | 'calles'>('calles');

  const centroInicial = esCoordValida(region) ? region : TAMBOGRANDE_DEFAULT;

  const html = useMemo(
    () => buildLeafletHtml(centroInicial.latitude, centroInicial.longitude, true, 'calles'),
    []
  );

  const sincronizar = () => {
    const oValida = esCoordValida(origen) ? origen : null;
    const dValida = esCoordValida(destino) ? destino : null;
    const ruta =
      oValida && dValida
        ? [
            [oValida.latitude, oValida.longitude],
            [dValida.latitude, dValida.longitude],
          ]
        : [];
    const payload = JSON.stringify({
      center: esCoordValida(region) ? region : TAMBOGRANDE_DEFAULT,
      origen: oValida,
      usarPinOrigen: true,
      destino: dValida,
      ruta,
      colorRuta: '#10b981',
    });
    webRef.current?.injectJavaScript(`window.actualizarMapa && window.actualizarMapa(${payload}); true;`);
  };

  useEffect(() => {
    sincronizar();
  }, [region.latitude, region.longitude, origen, destino]);

  const toggleCapa = () => {
    const siguiente = capa === 'satelite' ? 'calles' : 'satelite';
    setCapa(siguiente);
    webRef.current?.injectJavaScript(`window.cambiarCapa && window.cambiarCapa('${siguiente}'); true;`);
  };

  return (
    <View style={styles.wrapper}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.webview}
        onLoadEnd={sincronizar}
        onMessage={(event: any) => {
          try {
            const coord = JSON.parse(event.nativeEvent.data);
            if (typeof coord.latitude === 'number' && typeof coord.longitude === 'number') {
              const punto = { latitude: coord.latitude, longitude: coord.longitude };
              onMapPress?.(punto);
              onSelect?.(punto);
            }
          } catch {}
        }}
        javaScriptEnabled
        domStorageEnabled
      />

      <SelectorCapa capa={capa} onToggle={toggleCapa} />

      {onPressMiUbicacion && (
        <Pressable style={styles.topRightBtn} onPress={onPressMiUbicacion} disabled={ubicando}>
          {ubicando ? (
            <ActivityIndicator size="small" color="#059669" />
          ) : (
            <Text style={styles.gpsPillText}>⌖ Mi ubicación</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

export function MapaViaje({
  region,
  origen,
  destino,
  choferPos,
  etapa = 'hacia_cliente',
}: {
  region: Region;
  origen?: Coordenada | null;
  destino?: Coordenada | null;
  choferPos?: Coordenada | null;
  etapa?: 'hacia_cliente' | 'hacia_destino';
}) {
  const webRef = useRef<any>(null);
  const [capa, setCapa] = useState<'satelite' | 'calles'>('calles');

  const html = useMemo(
    () => buildLeafletHtml(TAMBOGRANDE_DEFAULT.latitude, TAMBOGRANDE_DEFAULT.longitude, false, 'calles'),
    []
  );

  const sincronizar = () => {
    const oValida = esCoordValida(origen) ? origen : null;
    const dValida = esCoordValida(destino) ? destino : null;
    const cValida = esCoordValida(choferPos) ? choferPos : null;
    const rValida = esCoordValida(region) ? region : TAMBOGRANDE_DEFAULT;

    const ruta: number[][] = [];
    if (etapa === 'hacia_cliente') {
      if (cValida && oValida) {
        ruta.push([cValida.latitude, cValida.longitude]);
        ruta.push([oValida.latitude, oValida.longitude]);
      }
    } else {
      const inicio = cValida || oValida;
      if (inicio && dValida) {
        ruta.push([inicio.latitude, inicio.longitude]);
        ruta.push([dValida.latitude, dValida.longitude]);
      }
    }

    const payload = JSON.stringify({
      center: oValida || cValida || dValida || rValida,
      origen: etapa === 'hacia_cliente' ? oValida : null,
      usarPinOrigen: true,
      chofer: cValida,
      destino: dValida,
      ruta,
      colorRuta: etapa === 'hacia_cliente' ? '#f59e0b' : '#10b981',
    });
    webRef.current?.injectJavaScript(`window.actualizarMapa && window.actualizarMapa(${payload}); true;`);
  };

  useEffect(() => {
    sincronizar();
  }, [region, origen, destino, choferPos, etapa]);

  const toggleCapa = () => {
    const siguiente = capa === 'satelite' ? 'calles' : 'satelite';
    setCapa(siguiente);
    webRef.current?.injectJavaScript(`window.cambiarCapa && window.cambiarCapa('${siguiente}'); true;`);
  };

  return (
    <View style={styles.wrapper}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.webview}
        onLoadEnd={sincronizar}
        javaScriptEnabled
        domStorageEnabled
      />
      <SelectorCapa capa={capa} onToggle={toggleCapa} />
      <Pressable style={styles.topRightBtn} onPress={sincronizar}>
        <Text style={styles.gpsPillText}>⌖ Centrar ruta</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, position: 'relative', backgroundColor: '#e5e7eb' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  layerBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    elevation: 4,
  },
  layerBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  topRightBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  gpsPillText: { color: '#059669', fontSize: 12, fontWeight: '800' },
  radarPill: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 3,
  },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#059669' },
  radarText: { fontSize: 12, fontWeight: '700', color: '#111827' },
});