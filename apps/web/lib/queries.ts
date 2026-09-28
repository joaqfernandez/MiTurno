'use client';

/**
 * Hooks de datos reales; los fixtures solo se usan en una sesión demo explícita.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFallback } from './api';
import { useAuth } from './auth';
import * as demo from './demo-data';
import type {
  Appointment,
  Doctor,
  DoctorLink,
  DoctorPage,
  DoctorLocation,
  DoctorSettings,
  MedicalRecord,
  Patient,
  Slot,
  NewScheduleOverride,
  ScheduleOverride,
  Specialty,
  WeeklyBlock,
} from './types';

export function useSpecialties() {
  return useQuery({
    queryKey: ['specialties'],
    queryFn: () =>
      withFallback(
        () => api<Specialty[]>('/specialties'),
        () => demo.demoSpecialties,
      ),
    staleTime: Infinity,
  });
}

export const DOCTORS_PAGE_SIZE = 12;

export function useDoctors(params: { specialty?: string; q?: string; page: number }) {
  const search = new URLSearchParams({ page: String(params.page), pageSize: String(DOCTORS_PAGE_SIZE) });
  if (params.specialty) search.set('specialty', params.specialty);
  if (params.q) search.set('q', params.q);

  return useQuery({
    // La pantalla muestra el error en lugar de la lista, con «Reintentar»; no se repite en el aviso general.
    meta: { localError: true },
    // Al cambiar de página se mantiene la anterior visible hasta que llega la nueva.
    placeholderData: keepPreviousData,
    queryKey: ['doctors', params],
    queryFn: () =>
      withFallback(
        () => api<DoctorPage>(`/doctors?${search}`),
        () => {
          const terms = (params.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
          const all = demo.demoDoctors.filter((d) => {
            const bySpecialty = !params.specialty || d.specialties.some((s) => s.slug === params.specialty);
            const text = `${d.firstName} ${d.lastName} ${d.specialties.map((s) => s.name).join(' ')}`.toLowerCase();
            return bySpecialty && terms.every((term) => text.includes(term));
          });
          const start = (params.page - 1) * DOCTORS_PAGE_SIZE;
          return { items: all.slice(start, start + DOCTORS_PAGE_SIZE), total: all.length, page: params.page, pageSize: DOCTORS_PAGE_SIZE };
        },
      ),
  });
}

export function useDoctor(id: string) {
  return useQuery({
    queryKey: ['doctor', id],
    queryFn: () =>
      withFallback(
        () => api<Doctor>(`/doctors/${id}`),
        () => {
          const d = demo.demoDoctors.find((x) => x.id === id);
          if (!d) throw new Error('Médico no encontrado');
          return d;
        },
      ),
  });
}

/** Resuelve el link propio de un médico; un nombre viejo devuelve el médico con su `slug` actual. */
export function useDoctorByLink(name: string) {
  return useQuery({
    // «Este link no existe» se muestra en la página, sin repetirlo en el aviso general.
    meta: { localError: true },
    queryKey: ['doctor-link', name],
    queryFn: () =>
      withFallback(
        () => api<Doctor>(`/doctors/by-link/${encodeURIComponent(name)}`),
        () => {
          throw new Error('Link no encontrado');
        },
      ),
  });
}

export function useMyLink() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['my-link', session?.email],
    queryFn: () => withFallback(() => api<DoctorLink>('/doctors/me/link'), () => ({ slug: null, url: null })),
  });
}

export function useSaveMyLink() {
  const qc = useQueryClient();
  return useMutation({
    // La tarjeta muestra el error junto al campo (por ejemplo, «ese link ya está en uso»).
    meta: { localError: true },
    mutationFn: (slug: string) =>
      withFallback(
        () => api<DoctorLink>('/doctors/me/link', { method: 'PUT', body: JSON.stringify({ slug }) }),
        () => ({ slug, url: null }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-link'] }),
  });
}

export function useAvailability(doctorId: string) {
  return useQuery({
    queryKey: ['availability', doctorId],
    queryFn: () => {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 14 * 86_400_000).toISOString();
      return withFallback(
        () => api<Slot[]>(`/appointments/availability/${doctorId}?from=${from}&to=${to}`),
        () => demo.demoAvailability(doctorId),
      );
    },
  });
}

export function useMyAppointments() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['my-appointments', session?.email],
    queryFn: () =>
      withFallback(
        () => api<Appointment[]>('/appointments/me'),
        () => [...demo.demoMyAppointments],
      ),
  });
}

export function useDoctorAgenda() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['doctor-agenda', session?.email],
    queryFn: () =>
      withFallback(
        () => api<Appointment[]>('/appointments/me'),
        () => [...demo.demoDoctorAgenda],
      ),
  });
}

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ doctorId, slot, reason }: { doctorId: string; slot: Slot; reason?: string }) =>
      withFallback(
        () =>
          api<Appointment>('/appointments', {
            method: 'POST',
            body: JSON.stringify({ doctorId, startAt: slot.startAt, reason }),
          }),
        () => demo.demoBook(doctorId, slot, reason),
      ),
    onSuccess: (_data, { doctorId }) => {
      qc.invalidateQueries({ queryKey: ['my-appointments'] });
      qc.invalidateQueries({ queryKey: ['availability', doctorId] });
    },
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    // `reason` es opcional; cuando cancela el médico, se le envía al paciente en el aviso.
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      withFallback(
        () => api<void>(`/appointments/${id}`, { method: 'DELETE', ...(reason ? { body: JSON.stringify({ reason }) } : {}) }),
        () => demo.demoCancel(id),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-appointments'] });
      qc.invalidateQueries({ queryKey: ['doctor-agenda'] });
    },
  });
}

export function useMyPatients() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['my-patients', session?.email],
    queryFn: () =>
      withFallback(
        () => api<Patient[]>('/patients/of-my-practice'),
        () => demo.demoPatients,
      ),
  });
}

export function useMedicalRecord(patientId: string) {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['medical-record', patientId, session?.email],
    queryFn: () =>
      withFallback(
        () => api<MedicalRecord>(`/medical-records/${patientId}`),
        () =>
          demo.demoRecords[patientId] ?? {
            id: `r-${patientId}`,
            entries: [],
          },
      ),
  });
}

export function useAddRecordEntry(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; content: string; amendsEntryId?: string }) =>
      withFallback(
        () =>
          api('/medical-records/entries', {
            method: 'POST',
            body: JSON.stringify({ patientId, ...data }),
          }),
        () => demo.demoAddEntry(patientId, data.title, data.content, data.amendsEntryId),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-record', patientId] }),
  });
}

export function useSchedule() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['schedule', session?.email],
    queryFn: () =>
      withFallback(
        () => api<WeeklyBlock[]>('/doctors/me/schedule'),
        () => demo.demoSchedule,
      ),
  });
}

export function useSaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blocks: WeeklyBlock[]) =>
      withFallback(
        () => api('/doctors/me/schedule', { method: 'PUT', body: JSON.stringify({ blocks }) }),
        () => demo.setDemoSchedule(blocks),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  });
}

export function useOverrides() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['overrides', session?.email],
    queryFn: () =>
      withFallback(
        () => api<ScheduleOverride[]>('/doctors/me/overrides'),
        () => demo.demoOverrides,
      ),
  });
}

export function useCreateOverride() {
  const qc = useQueryClient();
  return useMutation({
    // La pantalla muestra el error junto al formulario (con los turnos en conflicto), no en el aviso general.
    meta: { localError: true },
    mutationFn: (item: NewScheduleOverride) =>
      withFallback(
        () => api<ScheduleOverride>('/doctors/me/overrides', { method: 'POST', body: JSON.stringify(item) }),
        () => demo.addDemoOverride(item),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overrides'] }),
  });
}

export function useDeleteOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      withFallback(
        () => api(`/doctors/me/overrides/${id}`, { method: 'DELETE' }),
        () => demo.removeDemoOverride(id),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overrides'] }),
  });
}

export function useDoctorLocations() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['doctor-locations', session?.email],
    queryFn: () =>
      withFallback(
        () => api<DoctorLocation[]>('/doctors/me/locations'),
        () => demo.demoGetLocations(),
      ),
  });
}

export function useSaveDoctorLocations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locations: DoctorLocation[]) =>
      withFallback(
        () => api<DoctorLocation[]>('/doctors/me/locations', { method: 'PUT', body: JSON.stringify({ locations }) }),
        () => {
          demo.demoSaveLocations(locations);
          return locations;
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor-locations'] });
      qc.invalidateQueries({ queryKey: ['doctor'] });
    },
  });
}

export function useDoctorPhoto() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['doctor-photo', session?.email],
    queryFn: () =>
      withFallback(
        () => api<{ photoUrl?: string }>('/doctors/me/photo').then((r) => r.photoUrl),
        () => demo.demoGetPhoto(),
      ),
  });
}

export function useSaveDoctorPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoUrl: string | undefined) =>
      withFallback(
        () => api<{ photoUrl?: string }>('/doctors/me/photo', { method: 'PUT', body: JSON.stringify({ photoUrl }) }),
        () => {
          demo.demoSavePhoto(photoUrl);
          return { photoUrl };
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor-photo'] });
      qc.invalidateQueries({ queryKey: ['doctor'] });
      qc.invalidateQueries({ queryKey: ['doctors'] });
    },
  });
}

export function useDoctorSettings() {
  const { session, ready } = useAuth();
  return useQuery({
    enabled: ready && Boolean(session),
    queryKey: ['doctor-settings', session?.email],
    queryFn: () =>
      withFallback(
        () => api<DoctorSettings>('/doctors/me/settings'),
        () => demo.demoSettings,
      ),
  });
}

export function useSaveDoctorSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: DoctorSettings) =>
      withFallback(
        () => api('/doctors/me/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
        () => demo.setDemoSettings(settings),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctor-settings'] }),
  });
}
