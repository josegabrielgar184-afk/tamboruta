import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';

export default function AdminTabRedirect() {
  const user = useAuthStore((s: any) => s.user);
  const rol = user?.rol || '';
  const tieneAcceso =
    Boolean(user?.esSuperAdmin) ||
    Boolean(user?.esAyudante) ||
    rol === 'super_admin' ||
    rol === 'superadmin' ||
    rol === 'moderador';

  if (!user || !tieneAcceso) {
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/(admin)/dashboard" />;
}