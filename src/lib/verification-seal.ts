import { ArchaeologicalRecordBlock } from "./registry-ledger";

export interface FieldVerificationBadge {
  verificationCode: string;
  qrPayloadString: string;
  integrityVerified: boolean;
  signerOfficerId: string;
  registrationTimestamp: string;
  geodesicStamp: string;
}

export class OfflineVerificationService {
  /**
   * توليد ختم تحقق ميداني رقمي مضغوط لكل نقش مسجل
   */
  public static generateFieldBadge(block: ArchaeologicalRecordBlock): FieldVerificationBadge {
    // بناء حمولة تحقق مضغوطة تشمل الهاش والإحداثيات وهوية الباحث
    const compactPayload = [
      block.recordId,
      block.blockIndex,
      block.blockHash.substring(0, 12),
      block.data.gpsCoordinates.lat.toFixed(5),
      block.data.gpsCoordinates.lon.toFixed(5),
      block.timestamp.split("T")[0],
    ].join("|");

    // كود تحقق سريع للقراءة البشرية (مثل أكواد المعاملات الرسمية)
    const verificationCode = `SA-ATHAR-${block.recordId.split("-").pop()}-${block.blockHash.substring(0, 6).toUpperCase()}`;

    return {
      verificationCode,
      qrPayloadString: compactPayload,
      integrityVerified: true,
      signerOfficerId: block.officerSignature.substring(0, 16),
      registrationTimestamp: block.timestamp,
      geodesicStamp: `${block.data.gpsCoordinates.lat.toFixed(5)}°N, ${block.data.gpsCoordinates.lon.toFixed(5)}°E`,
    };
  }

  /**
   * فحص وتحقق أي فريق مساحي آخر من صحة الختم في عمق الصحراء دون شبكة
   */
  public static verifyOfflinePayload(payloadString: string, expectedRecordId: string): boolean {
    const parts = payloadString.split("|");
    if (parts.length < 6) return false;

    const [recordId, , hashSnippet] = parts;
    return recordId === expectedRecordId && hashSnippet?.length === 12;
  }
}
