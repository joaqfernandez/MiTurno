'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useDoctorByLink } from '@/lib/queries';
import { DoctorBooking } from '@/components/doctor-booking';
import { Button, EmptyState, Skeleton } from '@/components/ui';

/** miturnosapp.com/<nombre>: la agenda del médico para reservar. Un nombre viejo redirige al actual. */
export default function DoctorLinkPage() {
  const params = useParams<{ slug: string }>();
  const name = decodeURIComponent(params.slug).toLowerCase();
  const { data: doctor, isLoading, isError } = useDoctorByLink(name);
  const router = useRouter();
  const current = doctor?.slug;

  useEffect(() => {
    if (current && current !== params.slug) router.replace(`/${current}`);
  }, [current, params.slug, router]);

  if (isLoading || (current && current !== params.slug)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Skeleton className="h-40" />
        <Skeleton className="mt-6 h-96" />
      </main>
    );
  }

  if (isError || !doctor) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Este link no existe"
          description="Revisá que esté bien escrito o pedile a tu médico que te lo vuelva a enviar."
          action={
            <Link href="/medicos">
              <Button variant="secondary">Buscar médicos</Button>
            </Link>
          }
        />
      </main>
    );
  }

  return <DoctorBooking doctorId={doctor.id} returnPath={`/${doctor.slug}`} fromSearch={false} />;
}
