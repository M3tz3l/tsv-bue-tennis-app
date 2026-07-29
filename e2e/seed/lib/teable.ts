import { config } from './config.js';

export interface TeableMemberData {
  firstName: string;
  lastName: string;
  email: string;
  familyId: number;
  birthDate: string;
  joinDate: string;
  role: string;
}

interface TeableRecordResponse {
  id: string;
  fields: Record<string, any>;
}

/**
 * Fetch all existing test records from Teable by email domain.
 * Returns a map of email → teableRecordId.
 */
export async function getExistingTeableRecords(domain: string): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  let skip = 0;
  const take = 100;

  while (true) {
    const res = await fetch(
      `${config.teableApiUrl}/table/${config.membersTableId}/record?take=${take}&skip=${skip}`,
      {
        headers: {
          Authorization: `Bearer ${config.teableToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!res.ok) throw new Error(`Failed to list Teable records: ${res.status}`);

    const data = await res.json() as { records: TeableRecordResponse[] };
    if (data.records.length === 0) break;

    for (const record of data.records) {
      const email = (record.fields?.Email || '').toLowerCase();
      if (email.endsWith(`@${domain}`)) {
        existing.set(email, record.id);
      }
    }

    skip += take;
    if (data.records.length < take) break;
  }

  return existing;
}

/**
 * Create Teable records, skipping any that already exist.
 * Returns map of email → teableRecordId for all records (existing + new).
 */
export async function createTeableRecords(
  members: TeableMemberData[],
): Promise<Map<string, string>> {
  const domain = members[0]?.email.split('@')[1] || '';
  const idMap = new Map<string, string>();

  // First, check what already exists
  console.log('  Checking for existing Teable records...');
  const existing = await getExistingTeableRecords(domain);
  console.log(`  Found ${existing.size} existing records`);

  // Map existing records to output
  for (const [email, id] of existing) {
    idMap.set(email, id);
  }

  // Update existing records (e.g. role changes)
  const toUpdate = members.filter(m => existing.has(m.email.toLowerCase()));
  if (toUpdate.length > 0) {
    console.log(`  Updating ${toUpdate.length} existing records...`);
    await updateTeableRecords(toUpdate, existing);
  }

  // Filter out members that already exist
  const toCreate = members.filter(m => !existing.has(m.email.toLowerCase()));
  if (toCreate.length === 0) {
    console.log('  All records already exist, skipping creation');
    return idMap;
  }

  console.log(`  Creating ${toCreate.length} new records (${members.length - toCreate.length} skipped)...`);

  const batchSize = 50;
  for (let i = 0; i < toCreate.length; i += batchSize) {
    const batch = toCreate.slice(i, i + batchSize);
    console.log(`  Batch ${i + 1}-${Math.min(i + batchSize, toCreate.length)} of ${toCreate.length}...`);

    const records = batch.map(m => ({
      fields: {
        Vorname: m.firstName,
        Nachname: m.lastName,
        Email: m.email.toLowerCase(),
        Familie: m.familyId,
        Geburtsdatum: m.birthDate,
        Eintrittsdatum: m.joinDate,
        Rolle: m.role || '',
      },
    }));

    const res = await fetch(
      `${config.teableApiUrl}/table/${config.membersTableId}/record`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.teableToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create Teable records: ${res.status} ${err}`);
    }

    const data = await res.json() as { records: TeableRecordResponse[] };

    // Add new records to map — derive email from the returned record
    data.records.forEach((record) => {
      const email = (record.fields?.Email || '').toLowerCase();
      if (email) idMap.set(email, record.id);
    });

    if (i + batchSize < toCreate.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return idMap;
}

/**
 * Update existing Teable records (e.g. role changes).
 */
async function updateTeableRecords(
  members: TeableMemberData[],
  existingIds: Map<string, string>,
): Promise<void> {
  const batchSize = 50;
  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);
    const records = batch
      .map(m => {
        const id = existingIds.get(m.email.toLowerCase());
        if (!id) return null;
        return {
          id,
          fields: {
            Vorname: m.firstName,
            Nachname: m.lastName,
            Email: m.email.toLowerCase(),
            Familie: m.familyId,
            Geburtsdatum: m.birthDate,
            Eintrittsdatum: m.joinDate,
            Rolle: m.role || '',
          },
        };
      })
      .filter(Boolean);

    if (records.length === 0) continue;

    const res = await fetch(
      `${config.teableApiUrl}/table/${config.membersTableId}/record`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${config.teableToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`  Warning: failed to update batch: ${res.status} ${err}`);
    }

    if (i + batchSize < members.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

export async function deleteTeableRecordsByEmailDomain(domain: string): Promise<number> {
  let deleted = 0;
  let skip = 0;
  const take = 100;

  while (true) {
    const res = await fetch(
      `${config.teableApiUrl}/table/${config.membersTableId}/record?take=${take}&skip=${skip}`,
      {
        headers: {
          Authorization: `Bearer ${config.teableToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!res.ok) throw new Error(`Failed to list Teable records: ${res.status}`);

    const data = await res.json() as { records: TeableRecordResponse[] };
    if (data.records.length === 0) break;

    const testRecords = data.records.filter(r => {
      const email = (r.fields?.Email || '').toLowerCase();
      return email.endsWith(`@${domain}`);
    });

    if (testRecords.length > 0) {
      const deleteRes = await fetch(
        `${config.teableApiUrl}/table/${config.membersTableId}/record`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${config.teableToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            records: testRecords.map(r => r.id),
          }),
        },
      );

      if (deleteRes.ok) {
        deleted += testRecords.length;
        // Adjust offset: deleted records shift remaining left
        skip += take - testRecords.length;
      } else {
        skip += take;
      }
    } else {
      skip += take;
    }

    if (data.records.length < take) break;
  }

  return deleted;
}

export async function deleteTeableRecord(recordId: string): Promise<boolean> {
  const res = await fetch(
    `${config.teableApiUrl}/table/${config.membersTableId}/record/${recordId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${config.teableToken}`,
        'Content-Type': 'application/json',
      },
    },
  );
  return res.ok;
}
