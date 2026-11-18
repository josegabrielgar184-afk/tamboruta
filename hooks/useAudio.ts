import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  createAudioPlayer,
} from 'expo-audio';
import { subirAudioStorage } from '@/lib/storage';
import { subirImagenStorage } from '@/lib/storage';

type EstadoGrabacion = 'inactivo' | 'grabando' | 'procesando';
type PlayerType = ReturnType<typeof createAudioPlayer>;

export function useAudio() {
  const [estadoGrabacion, setEstadoGrabacion] = useState<EstadoGrabacion>('inactivo');
  const [duracionSeg, setDuracionSeg] = useState(0);
  const [reproduciendoId, setReproduciendoId] = useState<string | null>(null);
  const [errorAudio, setErrorAudio] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const reproductorRef = useRef<PlayerType | null>(null);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const limpiarRecursos = useCallback(() => {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    try {
      audioRecorder.stop();
    } catch {
      // recurso ya inactivo
    }
    if (reproductorRef.current) {
      try {
        reproductorRef.current.pause();
        (reproductorRef.current as any)?.release?.();
      } catch {
        // reproductor ya liberado
      }
      reproductorRef.current = null;
    }
  }, [audioRecorder]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      limpiarRecursos();
    };
  }, [limpiarRecursos]);

  const solicitarPermisos = async (): Promise<boolean> => {
    try {
      const { status } = await AudioModule.requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        if (mountedRef.current) {
          setErrorAudio('Permiso de micrófono denegado.');
        }
        return false;
      }
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      return true;
    } catch {
      if (mountedRef.current) {
        setErrorAudio('No se pudo verificar el permiso del micrófono.');
      }
      return false;
    }
  };

  const iniciarGrabacion = useCallback(async (): Promise<void> => {
    if (estadoGrabacion !== 'inactivo') return;
    if (Platform.OS === 'web') {
      if (mountedRef.current) {
        setErrorAudio('La grabación de audio no está disponible en web.');
      }
      return;
    }

    setErrorAudio(null);
    const tienePermiso = await solicitarPermisos();
    if (!tienePermiso) return;

    try {
      if (mountedRef.current) setEstadoGrabacion('grabando');
      setDuracionSeg(0);

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      intervaloRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        setDuracionSeg((prev) => prev + 1);
      }, 1000);
    } catch (e: any) {
      if (mountedRef.current) {
        setEstadoGrabacion('inactivo');
        setErrorAudio('No se pudo iniciar la grabación: ' + e.message);
      }
      try {
        audioRecorder.stop();
      } catch {
        // ignorar
      }
    }
  }, [estadoGrabacion, audioRecorder]);

  const detenerGrabacion = useCallback(async (): Promise<string | null> => {
    if (estadoGrabacion !== 'grabando') return null;

    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }

    try {
      if (mountedRef.current) setEstadoGrabacion('procesando');

      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri) {
        throw new Error('No se pudo obtener el audio grabado.');
      }

      const downloadUrl = await subirAudioStorage(uri);

      if (mountedRef.current) {
        setEstadoGrabacion('inactivo');
        setDuracionSeg(0);
      }
      return downloadUrl;
    } catch (e: any) {
      if (mountedRef.current) {
        setEstadoGrabacion('inactivo');
        setDuracionSeg(0);
        const errMsg = e instanceof Error ? e.message : 'Error desconocido al procesar el audio';
        setErrorAudio('No se pudo procesar la grabación: ' + errMsg);
        Alert.alert('Error de Audio', errMsg);
      }
      return null;
    }
  }, [estadoGrabacion, audioRecorder]);

  const cancelarGrabacion = useCallback(async (): Promise<void> => {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }

    try {
      audioRecorder.stop();
    } catch {
      // ignorar
    }

    if (mountedRef.current) {
      setEstadoGrabacion('inactivo');
      setDuracionSeg(0);
    }
  }, [audioRecorder]);

  const pausarAudio = useCallback(async (): Promise<void> => {
    if (reproductorRef.current) {
      try {
        reproductorRef.current.pause();
        (reproductorRef.current as any)?.release?.();
      } catch {
        // ignorar
      }
      reproductorRef.current = null;
    }
    if (mountedRef.current) setReproduciendoId(null);
  }, []);

  const reproducirAudio = useCallback(
    async (audioUrl: string, mensajeId: string): Promise<void> => {
      if (reproduciendoId === mensajeId) {
        await pausarAudio();
        return;
      }

      try {
        if (reproductorRef.current) {
          try {
            reproductorRef.current.pause();
            (reproductorRef.current as any)?.release?.();
          } catch {
            // ignorar
          }
          reproductorRef.current = null;
        }

        await AudioModule.setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });

        const player = createAudioPlayer({ uri: audioUrl });

        player.addListener('playbackStatusUpdate', (status) => {
          if (!mountedRef.current) return;
          if (status.didJustFinish || (status as any).playbackState === 'ended') {
            setReproduciendoId(null);
            if (reproductorRef.current) {
              try {
                (reproductorRef.current as any)?.release?.();
              } catch {
                // ignorar
              }
              reproductorRef.current = null;
            }
          }
        });

        player.play();
        reproductorRef.current = player;
        if (mountedRef.current) setReproduciendoId(mensajeId);
      } catch {
        if (mountedRef.current) {
          setErrorAudio('No se pudo reproducir el audio.');
        }
      }
    },
    [reproduciendoId, pausarAudio]
  );

  return {
    estadoGrabacion,
    duracionSeg,
    reproduciendoId,
    errorAudio,
    iniciarGrabacion,
    detenerGrabacion,
    cancelarGrabacion,
    reproducirAudio,
    pausarAudio,
    limpiarRecursos,
  };
}