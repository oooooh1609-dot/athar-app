import { AuthVaultManager } from "./auth-vault";

export interface ArchaeologicalRecordBlock {
  blockIndex: number;
  recordId: string;
  timestamp: string;
  previousHash: string;
  blockHash: string;
  officerSignature: string;
  data: {
    siteName: string;
    scriptType: string;
    rawText: string;
    translatedArabic: string;
    gpsCoordinates: { lat: number; lon: number };
    dimensionsMm: { width: number; height: number };
  };
}

export class ArchaeologicalLedger {
  private static DB_NAME = "athar_discovery_ledger_db";
  private static STORE_NAME = "immutable_ledger";
  private db: IDBDatabase | null = null;
  private authVault = new AuthVaultManager();

  private async initDatabase(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(ArchaeologicalLedger.DB_NAME, 1);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(ArchaeologicalLedger.STORE_NAME)) {
          const store = db.createObjectStore(ArchaeologicalLedger.STORE_NAME, {
            keyPath: "blockIndex",
          });
          store.createIndex("recordId", "recordId", { unique: true });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * تسجيل وتثبيت نقش جديد في دفتر القيد الأثري بسلسلة غير قابلة للتعديل
   */
  public async registerDiscovery(
    officerId: string,
    discoveryData: ArchaeologicalRecordBlock["data"],
  ): Promise<ArchaeologicalRecordBlock> {
    const db = await this.initDatabase();
    const lastBlock = await this.getLastBlock();

    const blockIndex = lastBlock ? lastBlock.blockIndex + 1 : 1;
    const previousHash = lastBlock
      ? lastBlock.blockHash
      : "0000000000000000000000000000000000000000000000000000000000000000";
    const timestamp = new Date().toISOString();
    const recordId = `ATHAR-REG-${Date.now().toString(36).toUpperCase()}-${blockIndex}`;

    const rawPayload = JSON.stringify({
      blockIndex,
      recordId,
      timestamp,
      previousHash,
      data: discoveryData,
    });

    // 1. حساب الهاش المشفر للكتلة
    const blockHash = await this.sha256(rawPayload);

    // 2. توقيع الباحث المعتمد بخاتمه الرقمي
    const officerSignature = await this.authVault.signArchaeologicalRecord(officerId, blockHash);

    const newBlock: ArchaeologicalRecordBlock = {
      blockIndex,
      recordId,
      timestamp,
      previousHash,
      blockHash,
      officerSignature,
      data: discoveryData,
    };

    // 3. الحفظ في دفتر القيد الثابت
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ArchaeologicalLedger.STORE_NAME, "readwrite");
      tx.objectStore(ArchaeologicalLedger.STORE_NAME).put(newBlock);
      tx.oncomplete = () => resolve(newBlock);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * التحقق من صحة وسلامة دفتر السجلات بالكامل وتأكيد عدم تلاعب أي شخص بالاكتشافات
   */
  public async verifyLedgerIntegrity(): Promise<{
    isValid: boolean;
    checkedBlocks: number;
    errorIndex?: number;
  }> {
    const blocks = await this.getAllBlocks();
    if (blocks.length === 0) return { isValid: true, checkedBlocks: 0 };

    for (let i = 0; i < blocks.length; i++) {
      const current = blocks[i]!;

      // فحص ترابط الهاش مع الكتلة السابقة
      if (i > 0) {
        const prev = blocks[i - 1]!;
        if (current.previousHash !== prev.blockHash) {
          return { isValid: false, checkedBlocks: i, errorIndex: current.blockIndex };
        }
      }

      // إعادة حساب الهاش ومطابقته
      const rawPayload = JSON.stringify({
        blockIndex: current.blockIndex,
        recordId: current.recordId,
        timestamp: current.timestamp,
        previousHash: current.previousHash,
        data: current.data,
      });

      const calculatedHash = await this.sha256(rawPayload);
      if (calculatedHash !== current.blockHash) {
        return { isValid: false, checkedBlocks: i, errorIndex: current.blockIndex };
      }
    }

    return { isValid: true, checkedBlocks: blocks.length };
  }

  public async getAllBlocks(): Promise<ArchaeologicalRecordBlock[]> {
    const db = await this.initDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(ArchaeologicalLedger.STORE_NAME, "readonly");
      const req = tx.objectStore(ArchaeologicalLedger.STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as ArchaeologicalRecordBlock[]) || []);
      req.onerror = () => resolve([]);
    });
  }

  private async getLastBlock(): Promise<ArchaeologicalRecordBlock | null> {
    const blocks = await this.getAllBlocks();
    return blocks.length > 0 ? blocks[blocks.length - 1]! : null;
  }

  private async sha256(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const buf = await window.crypto.subtle.digest("SHA-256", encoder.encode(str));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
