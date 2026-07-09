'use client';

/**
 * Hooks de datos (TanStack Query). Cada hook intenta el backend real y,
 * si no está disponible, cae a los datos de demostración para que toda
 * la UI sea navegable sin API corriendo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFallback } from './api';
import * as demo from './demo-data';
import type {
  Appointment,
  Doctor,
  DoctorSettings,
  MedicalRecord,
  Patient,
  Slot,
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

export function useDoctors(params: { specialty?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.specialty) search.set('specialty', params.specialty);
  if (params.q) search.set('q', params.q);

  return useQuery({
    queryKey: ['doctors', params],
    queryFn: () =>
      withFallback(
        () => api<Doctor[]>(`/doctors?${search}`),
        () => {
          const q = params.q?.toLowerCase().trim();
          return demo.demoDoctors.filter((d) => {
            const bySpecialty = !params.specialty || d.specialties.some((s) => s.slug === params.specialty);
            const byQ =
              !q ||
              `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
              d.specialties.some((s) => s.name.toLowerCase().includes(q));
            return bySpecialty && byQ;
          });
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
  return useQuery({
    queryKey: ['my-appointments'],
    queryFn: () =>
      withFallback(
        () => api<Appointment[]>('/appointments/me'),
        () => [...demo.demoMyAppointments],
      ),
  });
}

export function useDoctorAgenda() {
  return useQuery({
    queryKey: ['doctor-agenda'],
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
    mutationFn: (id: string) =>
      withFallback(
        () => api<void>(`/appointments/${id}`, { method: 'DELETE' }),
        () => demo.demoCancel(id),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-appointments'] });
      qc.invalidateQueries({ queryKey: ['doctor-agenda'] });
    },
  });
}

export function useMyPatients() {
  return useQuery({
    queryKey: ['my-patients'],
    queryFn: () =>
      withFallback(
        () => api<Patient[]>('/patients/of-my-practice'),
        () => demo.demoPatients,
      ),
  });
}

export function useMedicalRecord(patientId: string) {
  return useQuery({
    queryKey: ['medical-record', patientId],
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
  return useQuery({
    queryKey: ['schedule'],
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

export function useDoctorSettings() {
  return useQuery({
    queryKey: ['doctor-settings'],
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
