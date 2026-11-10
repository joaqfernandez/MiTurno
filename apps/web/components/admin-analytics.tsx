'use client';

import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '@/lib/api';
import { downloadCsv, type CsvValue } from '@/lib/csv';
import { Button, Card, Skeleton } from '@/components/ui';

interface Counted { label: string; count: number }
interface Week { week: string; booked: number; cancelled: number; patients: number; doctors: number }
interface DoctorRow {
  firstName: string; lastName: string; email: string; licenseNumber: string; status: string;
  specialties: string[]; createdAt: string; appointments: number; appointmentsLast30Days: number;
}
interface Analytics {
  generatedAt: string;
  totals: {
    patients: number; doctorsActive: number; doctorsPending: number; doctorsSuspended: number;
    appointments: number; appointmentsUpcoming: number; notificationsFailed: number; jobsFailed: number;
  };
  doctorsBySpecialty: Counted[];
  appointmentsBySpecialty: Counted[];
  patientsByAge: Counted[];
  patientsByInsurance: Counted[];
  appointmentsByStatus: Counted[];
  weekly: Week[];
  doctors: DoctorRow[];
}

const STATUS: Record<string, string> = {
  CONFIRMED: 'Confirmados', PENDING_PAYMENT: 'Esperando seña', COMPLETED: 'Atendidos', NO_SHOW: 'Ausentes',
  CANCELLED_BY_PATIENT: 'Cancelados por el paciente', CANCELLED_BY_DOCTOR: 'Cancelados por el médico',
};
const ACCOUNT: Record<string, string> = { ACTIVE: 'Activo', PENDING_VERIFICATION: 'Pendiente de aprobación', SUSPENDED: 'Suspendido' };
const number = new Intl.NumberFormat('es-AR');
const today = () => format(new Date(), 'yyyy-MM-dd');

function ExportButton({ name, headers, rows }: { name: string; headers: string[]; rows: CsvValue[][] }) {
  return (
    <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" disabled={rows.length === 0}
      onClick={() => downloadCsv(`miturno-${name}-${today()}.csv`, headers, rows)} aria-label={`Exportar ${name} en CSV`}>
      Exportar CSV
    </Button>
  );
}

function Panel({ title, note, action, children }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{number.format(value)}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </Card>
  );
}

/** Barras horizontales de una sola serie: el valor va escrito al lado, así se lee sin depender del color. */
function BarList({ rows, name, unit }: { rows: Counted[]; name: string; unit: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return <p className="text-sm text-slate-500">Todavía no hay datos.</p>;
  return (
    <ul className="flex flex-col gap-2.5" aria-label={name}>
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
          title={`${row.label}: ${number.format(row.count)} ${unit} (${Math.round((row.count / total) * 100)}%)`}>
          <span className="truncate text-slate-600">{row.label}</span>
          <span className="h-3 rounded-full bg-slate-100" aria-hidden="true">
            <span className="block h-3 rounded-full bg-brand-500" style={{ width: `${(row.count / max) * 100}%`, minWidth: row.count ? 4 : 0 }} />
          </span>
          <span className="w-10 text-right font-medium tabular-nums text-slate-900">{number.format(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columnas por semana. Cada medida tiene su propio gráfico y su propia escala: nunca dos ejes en uno. */
function WeekColumns({ title, weeks, pick }: { title: string; weeks: Week[]; pick: (week: Week) => number }) {
  const values = weeks.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-slate-700">{title}</h4>
        <p className="text-sm tabular-nums text-slate-500"><span className="font-semibold text-slate-900">{number.format(total)}</span> en 12 semanas</p>
      </div>
      <ol className="mt-2 flex h-24 items-end gap-0.5 border-b border-slate-200" aria-label={`${title} por semana`}>
        {weeks.map((week, index) => {
          const label = `Semana del ${format(parseISO(week.week), "d 'de' MMM", { locale: es })}: ${number.format(values[index])}`;
          return (
            <li key={week.week} className="group relative flex h-full flex-1 items-end" title={label} aria-label={label}>
              <span className="block w-full rounded-t bg-brand-500 group-hover:bg-brand-700"
                style={{ height: `${(values[index] / max) * 100}%`, minHeight: values[index] ? 3 : 0 }} />
            </li>
          );
        })}
      </ol>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{format(parseISO(weeks[0].week), 'd MMM', { locale: es })}</span>
        <span>{format(parseISO(weeks[weeks.length - 1].week), 'd MMM', { locale: es })}</span>
      </div>
    </div>
  );
}

const counted = (rows: Counted[]): CsvValue[][] => rows.map((row) => [row.label, row.count]);

export function AdminAnalytics({ sessionEmail }: { sessionEmail?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-analytics', sessionEmail], queryFn: () => api<Analytics>('/admin/analytics'), meta: { localError: true },
  });
  if (isLoading) return <Skeleton className="h-96" />;
  if (error || !data) {
    return (
      <Card className="p-5">
        <p role="alert" className="text-sm text-danger-700">No se pudieron cargar los números: {error?.message ?? 'sin respuesta'}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => refetch()}>Reintentar</Button>
      </Card>
    );
  }
  const { totals } = data;
  const statuses = data.appointmentsByStatus.map((row) => ({ ...row, label: STATUS[row.label] ?? row.label }));
  return (
    <section aria-label="Números de MiTurno" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Números</h2>
          <p className="text-sm text-slate-500">
            Solo totales: ningún gráfico ni archivo incluye nombres o datos de pacientes. Actualizado {format(parseISO(data.generatedAt), "d/M 'a las' HH:mm")}.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>Actualizar</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Médicos activos" value={totals.doctorsActive}
          note={`${number.format(totals.doctorsPending)} por aprobar · ${number.format(totals.doctorsSuspended)} suspendidos`} />
        <Tile label="Pacientes" value={totals.patients} />
        <Tile label="Turnos" value={totals.appointments} note={`${number.format(totals.appointmentsUpcoming)} próximos`} />
        <Tile label="Envíos fallidos" value={totals.notificationsFailed + totals.jobsFailed} note="Emails y tareas que no salieron" />
      </div>

      <Panel title="Actividad de las últimas 12 semanas" note="Semanas de lunes a domingo, hora de Argentina. Los turnos se cuentan por la fecha del turno."
        action={<ExportButton name="actividad-semanal" headers={['Semana (lunes)', 'Turnos', 'Turnos cancelados', 'Pacientes nuevos', 'Médicos nuevos']}
          rows={data.weekly.map((week) => [week.week, week.booked, week.cancelled, week.patients, week.doctors])} />}>
        <div className="grid gap-6 sm:grid-cols-2">
          <WeekColumns title="Turnos" weeks={data.weekly} pick={(week) => week.booked} />
          <WeekColumns title="Turnos cancelados" weeks={data.weekly} pick={(week) => week.cancelled} />
          <WeekColumns title="Pacientes nuevos" weeks={data.weekly} pick={(week) => week.patients} />
          <WeekColumns title="Médicos nuevos" weeks={data.weekly} pick={(week) => week.doctors} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Médicos por especialidad" note="Médicos activos. Quien tiene dos especialidades cuenta en las dos."
          action={<ExportButton name="medicos-por-especialidad" headers={['Especialidad', 'Médicos']} rows={counted(data.doctorsBySpecialty)} />}>
          <BarList rows={data.doctorsBySpecialty} name="Médicos por especialidad" unit="médicos" />
        </Panel>
        <Panel title="Turnos por especialidad" note="Últimas 12 semanas y turnos futuros, sin los cancelados: muestra dónde hay demanda."
          action={<ExportButton name="turnos-por-especialidad" headers={['Especialidad', 'Turnos']} rows={counted(data.appointmentsBySpecialty)} />}>
          <BarList rows={data.appointmentsBySpecialty} name="Turnos por especialidad" unit="turnos" />
        </Panel>
        <Panel title="Edad de los pacientes" note="«Sin dato»: pacientes que no cargaron su fecha de nacimiento."
          action={<ExportButton name="pacientes-por-edad" headers={['Edad', 'Pacientes']} rows={counted(data.patientsByAge)} />}>
          <BarList rows={data.patientsByAge} name="Edad de los pacientes" unit="pacientes" />
        </Panel>
        <Panel title="Obra social o prepaga" note="Las 10 más frecuentes, tal como las escribe cada paciente."
          action={<ExportButton name="pacientes-por-obra-social" headers={['Obra social', 'Pacientes']} rows={counted(data.patientsByInsurance)} />}>
          <BarList rows={data.patientsByInsurance} name="Obra social o prepaga" unit="pacientes" />
        </Panel>
        <Panel title="Estado de los turnos" note="Todos los turnos desde el inicio."
          action={<ExportButton name="turnos-por-estado" headers={['Estado', 'Turnos']} rows={counted(statuses)} />}>
          <BarList rows={statuses} name="Estado de los turnos" unit="turnos" />
        </Panel>
        <Panel title="Médicos y su actividad" note="Un renglón por médico, con sus turnos totales y de los últimos 30 días."
          action={<ExportButton name="medicos" headers={['Apellido', 'Nombre', 'Email', 'Matrícula', 'Estado', 'Especialidades', 'Alta', 'Turnos', 'Turnos últimos 30 días']}
            rows={data.doctors.map((doctor) => [doctor.lastName, doctor.firstName, doctor.email, doctor.licenseNumber, ACCOUNT[doctor.status] ?? doctor.status,
              doctor.specialties.join(', '), doctor.createdAt.slice(0, 10), doctor.appointments, doctor.appointmentsLast30Days])} />}>
          <BarList name="Médicos con más turnos en los últimos 30 días" unit="turnos"
            rows={[...data.doctors].sort((a, b) => b.appointmentsLast30Days - a.appointmentsLast30Days).slice(0, 6)
              .map((doctor) => ({ label: `${doctor.firstName} ${doctor.lastName}`, count: doctor.appointmentsLast30Days }))} />
        </Panel>
      </div>
    </section>
  );
}
