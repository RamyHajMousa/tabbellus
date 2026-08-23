import { describe, it, expect, vi, afterEach } from 'vitest';
import { dataService } from '@/lib/dataService';
import { db } from '@/lib/db';

describe('DataService — Backup & Restore Integration', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    // Ensure cleanup of any leftover tables
    await dataService.clearData();
  });

  // Helper to seed standard test data
  async function seedTestData() {
    const spaceId1 = await db.spaces.add({
      name: 'Work Space',
      createdAt: Date.now() - 10000,
    }) as number;

    const spaceId2 = await db.spaces.add({
      name: 'Personal Space',
      createdAt: Date.now() - 5000,
    }) as number;

    await db.tabs.bulkAdd([
      { spaceId: spaceId1, url: 'https://work1.com', title: 'Work 1', order: 0 },
      { spaceId: spaceId1, url: 'https://work2.com', title: 'Work 2', order: 1 },
      { spaceId: spaceId2, url: 'https://personal1.com', title: 'Personal 1', order: 0 },
      { spaceId: spaceId2, url: 'https://personal2.com', title: 'Personal 2', order: 1 },
    ]);

    await db.readLater.bulkAdd([
      { url: 'https://read1.com', title: 'Read Later 1', addedAt: Date.now(), status: 'unread' },
      { url: 'https://read2.com', title: 'Read Later 2', addedAt: Date.now(), status: 'read' },
    ]);

    return { spaceId1, spaceId2 };
  }

  // ── Test Case 1: Export Validation ─────────────────────────────
  it('should export all spaces, tabs, and read-later items into a valid JSON structure', async () => {
    await seedTestData();

    const originalDocument = globalThis.document;
    const originalURL = globalThis.URL;
    const originalBlob = globalThis.Blob;

    let exportedPayload: any = null;

    // Mock DOM anchor and click triggers
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    globalThis.document = {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      createElement: vi.fn().mockReturnValue(mockAnchor),
    } as any;

    globalThis.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-download-url'),
      revokeObjectURL: vi.fn(),
    } as any;

    // Mock Blob constructor to capture the serialized backup string
    class MockBlob extends originalBlob {
      constructor(chunks: any[], options?: any) {
        super(chunks, options);
        exportedPayload = JSON.parse(chunks[0]);
      }
    }
    globalThis.Blob = MockBlob as any;

    try {
      await dataService.exportData();

      expect(exportedPayload).toBeDefined();
      expect(exportedPayload.version).toBe(1);
      expect(exportedPayload.date).toBeDefined();

      // Check spaces
      expect(exportedPayload.spaces).toHaveLength(2);
      expect(exportedPayload.spaces[0].name).toBe('Work Space');
      expect(exportedPayload.spaces[1].name).toBe('Personal Space');

      // Check tabs
      expect(exportedPayload.tabs).toHaveLength(4);
      expect(exportedPayload.tabs[0].url).toBe('https://work1.com');
      expect(exportedPayload.tabs[2].url).toBe('https://personal1.com');

      // Check readLater items
      expect(exportedPayload.readLater).toHaveLength(2);
      expect(exportedPayload.readLater[0].url).toBe('https://read1.com');
      expect(exportedPayload.readLater[1].status).toBe('read');
    } finally {
      // Restore global objects to avoid test leaks
      globalThis.document = originalDocument;
      globalThis.URL = originalURL;
      globalThis.Blob = originalBlob;
    }
  });

  // ── Test Case 2: Destructive Cleansing ──────────────────────────
  it('should clear all database tables completely', async () => {
    await seedTestData();

    // Verify database has data before purge
    expect(await db.spaces.count()).toBe(2);
    expect(await db.tabs.count()).toBe(4);
    expect(await db.readLater.count()).toBe(2);

    await dataService.clearData();

    // Assert everything is empty
    expect(await db.spaces.count()).toBe(0);
    expect(await db.tabs.count()).toBe(0);
    expect(await db.readLater.count()).toBe(0);
  });

  // ── Test Case 3: Relational Import & Foreign Key Re-mapping ─────
  it('should import data and correctly re-map tab spaceId foreign keys to the new auto-incremented space IDs', async () => {
    // 1. Seed database with relations and capture payload
    const { spaceId1, spaceId2 } = await seedTestData();

    const spaces = await db.spaces.toArray();
    const tabs = await db.tabs.toArray();
    const readLater = await db.readLater.toArray();

    const payload = {
      version: 1,
      date: new Date().toISOString(),
      spaces,
      tabs,
      readLater,
    };

    // 2. Wipe database
    await dataService.clearData();

    // 3. Mock File and perform Import
    const mockFile = {
      text: async () => JSON.stringify(payload),
    } as unknown as File;

    const importResult = await dataService.importData(mockFile);
    expect(importResult.spacesCount).toBe(2);
    expect(importResult.tabsCount).toBe(4);
    expect(importResult.readLaterCount).toBe(2);

    // 4. Retrieve imported spaces and build name map to new IDs
    const importedSpaces = await db.spaces.toArray();
    expect(importedSpaces).toHaveLength(2);

    const workSpace = importedSpaces.find((s) => s.name === 'Work Space');
    const personalSpace = importedSpaces.find((s) => s.name === 'Personal Space');

    expect(workSpace).toBeDefined();
    expect(personalSpace).toBeDefined();

    // Ensure the new space IDs are newly generated (likely different, but definitely valid auto-increment numbers)
    const newWorkSpaceId = workSpace!.id!;
    const newPersonalSpaceId = personalSpace!.id!;

    // 5. Retrieve imported tabs and verify correct mapping
    const importedTabs = await db.tabs.toArray();
    expect(importedTabs).toHaveLength(4);

    // Filter tabs by their new spaceId assignment
    const workTabs = importedTabs.filter((t) => t.spaceId === newWorkSpaceId);
    const personalTabs = importedTabs.filter((t) => t.spaceId === newPersonalSpaceId);

    expect(workTabs).toHaveLength(2);
    expect(personalTabs).toHaveLength(2);

    // Assert that the tabs correspond to the correct parent space contents
    expect(workTabs.map((t) => t.url)).toContain('https://work1.com');
    expect(workTabs.map((t) => t.url)).toContain('https://work2.com');
    expect(personalTabs.map((t) => t.url)).toContain('https://personal1.com');
    expect(personalTabs.map((t) => t.url)).toContain('https://personal2.com');

    // Make sure old IDs do not bleed into the imported tab records
    expect(workTabs.every((t) => t.spaceId !== spaceId1)).toBe(true);
    expect(personalTabs.every((t) => t.spaceId !== spaceId2)).toBe(true);

    // Verify telemetry keys
    expect(importResult.spacesImported).toBe(2);
    expect(importResult.tabsImported).toBe(4);
  });

  // ── Test Case 4: Invalid File Format Rejection ─────────────────
  it('should reject non-JSON files with descriptive error', async () => {
    const mockFile = {
      name: 'notes.txt',
      text: async () => 'some plain text content',
    } as unknown as File;

    await expect(dataService.importData(mockFile)).rejects.toThrow(
      'Invalid file format. Please upload a valid JSON backup file.'
    );
  });

  // ── Test Case 5: Corrupt JSON Handling ─────────────────────────
  it('should reject malformed JSON with descriptive error', async () => {
    const mockFile = {
      name: 'corrupt.json',
      text: async () => '{"version": 1, "spaces": [ incomplete...',
    } as unknown as File;

    await expect(dataService.importData(mockFile)).rejects.toThrow(
      'Corrupt or malformed JSON. Could not parse backup file.'
    );
  });

  // ── Test Case 6: Schema Validation (Missing Spaces) ────────────
  it('should reject JSON payload missing spaces', async () => {
    const mockFile = {
      name: 'empty.json',
      text: async () => JSON.stringify({ version: 1, date: new Date().toISOString() }),
    } as unknown as File;

    await expect(dataService.importData(mockFile)).rejects.toThrow(
      'Invalid backup file: missing spaces data'
    );
  });

  // ── Test Case 7: Single Space Export and Import ────────────────
  it('should export a single space as JSON and re-import it with all tabs mapped', async () => {
    const { spaceId1 } = await seedTestData();

    const originalDocument = globalThis.document;
    const originalURL = globalThis.URL;
    const originalBlob = globalThis.Blob;

    let exportedSinglePayload: any = null;

    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    globalThis.document = {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      createElement: vi.fn().mockReturnValue(mockAnchor),
    } as any;

    globalThis.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-download-single-url'),
      revokeObjectURL: vi.fn(),
    } as any;

    class MockBlob extends originalBlob {
      constructor(chunks: any[], options?: any) {
        super(chunks, options);
        exportedSinglePayload = JSON.parse(chunks[0]);
      }
    }
    globalThis.Blob = MockBlob as any;

    try {
      await dataService.exportSpaceAsJson(spaceId1);

      expect(exportedSinglePayload).toBeDefined();
      expect(exportedSinglePayload.version).toBe(1);
      expect(exportedSinglePayload.space.name).toBe('Work Space');
      expect(exportedSinglePayload.tabs).toHaveLength(2);
      expect(mockAnchor.download).toContain('tabbellus-space-work_space.json');

      // Clear data and import the single-space backup
      await dataService.clearData();

      const mockFile = {
        name: 'single-space.json',
        text: async () => JSON.stringify(exportedSinglePayload),
      } as unknown as File;

      const result = await dataService.importData(mockFile);
      expect(result.spacesCount).toBe(1);
      expect(result.tabsCount).toBe(2);

      const spaces = await db.spaces.toArray();
      expect(spaces).toHaveLength(1);
      expect(spaces[0].name).toBe('Work Space');

      const tabs = await db.tabs.toArray();
      expect(tabs).toHaveLength(2);
      expect(tabs[0].spaceId).toBe(spaces[0].id);
      expect(tabs[1].spaceId).toBe(spaces[0].id);
    } finally {
      globalThis.document = originalDocument;
      globalThis.URL = originalURL;
      globalThis.Blob = originalBlob;
    }
  });

  // ── Test Case 8: Invalid Tab Entries Rejection ─────────────────
  it('should reject backup payload with invalid or empty tab URLs', async () => {
    const invalidPayload = {
      version: 1,
      spaces: [{ name: 'Valid Space' }],
      tabs: [{ spaceId: 1, url: '   ' }], // empty URL
    };

    const mockFile = {
      name: 'backup.json',
      text: async () => JSON.stringify(invalidPayload),
    } as unknown as File;

    await expect(dataService.importData(mockFile)).rejects.toThrow(
      'Invalid backup file: contains invalid tab entries.'
    );

    // Verify nothing was written to database
    expect(await db.spaces.count()).toBe(0);
    expect(await db.tabs.count()).toBe(0);
  });

  // ── Test Case 9: Invalid Space Entries Rejection ───────────────
  it('should reject backup payload with empty space names', async () => {
    const invalidPayload = {
      version: 1,
      spaces: [{ name: '   ' }], // whitespace only
    };

    const mockFile = {
      name: 'backup.json',
      text: async () => JSON.stringify(invalidPayload),
    } as unknown as File;

    await expect(dataService.importData(mockFile)).rejects.toThrow(
      'Invalid backup file: contains invalid space entries.'
    );

    expect(await db.spaces.count()).toBe(0);
  });
});

