/**
 * Database seed script.
 * Creates a default development user.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Create default dev user
    const user = await prisma.user.upsert({
        where: { id: '00000000-0000-0000-0000-000000000001' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000001',
            email: 'dev@getdtax.com',
            name: 'Dev User',
        },
    });

    console.log('✅ Seeded user:', user.email);
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
