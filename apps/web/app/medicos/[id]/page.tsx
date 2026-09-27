'use client';

import { useParams } from 'next/navigation';
import { DoctorBooking } from '@/components/doctor-booking';

export default function DoctorDetailPage() {
  const params = useParams<{ id: string }>();
  return <DoctorBooking doctorId={params.id} returnPath={`/medicos/${params.id}`} />;
}
