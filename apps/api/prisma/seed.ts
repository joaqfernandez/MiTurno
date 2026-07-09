import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SPECIALTIES = [
  'Clínica Médica', 'Cardiología', 'Dermatología', 'Ginecología',
  'Pediatría', 'Traumatología', 'Oftalmología', 'Psiquiatría',
  'Otorrinolaringología', 'Neurología', 'Endocrinología', 'Urología',
];

async function main() {
  for (const name of SPECIALTIES) {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-');
    await prisma.specialty.upsert({
      where: { slug },
      create: { name, slug },
      update: {},
    });
  }
  console.log(`Seed OK: ${SPECIALTIES.length} especialidades`);
}

main().finally(() => prisma.$disconnect());
