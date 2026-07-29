import { config } from './config.js';

export interface TestUser {
  email: string;
  firstName: string;
  lastName: string;
  familyId: number;
  birthDate: string;
  joinDate: string;
  role: string;
  teableRecordId?: string;
}

export interface TestFixtures {
  generatedAt: string;
  password: string;
  users: TestUser[];
}

export function generateTestUsers(): TestUser[] {
  const users: TestUser[] = [];

  for (let i = 1; i <= config.userCount; i++) {
    const padded = String(i).padStart(3, '0');
    const familyIndex = Math.ceil(i / 2); // 2 members per family
    const isOrga = i <= config.orgaCount;

    // Random but deterministic birth dates (1960-2005)
    const birthYear = 1960 + (i * 7) % 46;
    const birthMonth = String(1 + (i * 3) % 12).padStart(2, '0');
    const birthDay = String(1 + (i * 11) % 28).padStart(2, '0');

    // Join dates between 2015-2024
    const joinYear = 2015 + (i * 3) % 10;
    const joinMonth = String(1 + (i * 5) % 12).padStart(2, '0');
    const joinDay = String(1 + (i * 7) % 28).padStart(2, '0');

    users.push({
      email: `${config.emailPrefix}${padded}@e2e-test.local`,
      firstName: 'Test',
      lastName: `User${padded}`,
      familyId: familyIndex,
      birthDate: `${birthYear}-${birthMonth}-${birthDay}`,
      joinDate: `${joinYear}-${joinMonth}-${joinDay}`,
      role: isOrga ? 'orga' : '',
    });
  }

  return users;
}
