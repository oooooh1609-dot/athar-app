// دالة التحقق من رمز الأدمن المباشر
export function verifyAdminPin(inputPin: unknown) {
  const cleanPin = String(inputPin ?? "").trim();

  // الرمز الأساسي 2030 أو الرمز الاحتياطي 1234 أو القيمة المعرفة في البيئة
  const validPins = [
    "2030",
    "1234",
    String(
      (import.meta as unknown as { env?: Record<string, string> }).env?.ATHAR_PIN_HASH ||
        (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ATHAR_PIN_HASH ||
        "2030",
    ),
  ];

  if (validPins.includes(cleanPin)) {
    // تسجيل حالة الدخول بنجاح
    if (typeof window !== "undefined") {
      localStorage.setItem("athar_admin_logged", "true");
    }
    return { success: true, message: "تم تسجيل دخول المشرف بنجاح" };
  } else {
    return { success: false, message: "رمز الدخول غير صحيح، يرجى المحاولة مجدداً" };
  }
}

export function isAdminLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("athar_admin_logged") === "true";
}

export function adminLogout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("athar_admin_logged");
  }
}

export {
  isCloudConfigured,
  verifyAdminStatus,
  createAccessCode,
  validateAccessCode,
} from "./hybrid-access";
