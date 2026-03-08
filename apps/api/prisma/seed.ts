/**
 * Database seed script.
 * Creates a default development user with auth credentials.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    // Hash default dev password
    const passwordHash = await bcrypt.hash('devpassword123', 12);

    // Create default dev user
    const user = await prisma.user.upsert({
        where: { id: '00000000-0000-0000-0000-000000000001' },
        update: { passwordHash },
        create: {
            id: '00000000-0000-0000-0000-000000000001',
            email: 'dev@getdtax.com',
            name: 'Dev User',
            passwordHash,
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
