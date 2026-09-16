import { supabase } from "@/integrations/supabase/client";

// فحص ذكي: هل السيرفر السحابي متصل وقيد العمل؟
export const isCloudConfigured = () => {
  const url = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL;
  return Boolean(url && !url.includes("placeholder") && !url.includes("disabled"));
};

// 1. التحقق من صلاحية المشرف (هجين)
export async function verifyAdminStatus(): Promise<boolean> {
  // إذا كنا أوفلاين أو في المعاينة: قبول الدخول المحلي فوراً برمز 2030
  if (!isCloudConfigured()) {
    return localStorage.getItem("athar_admin_logged") === "true";
  }

  // إذا كنا أونلاين على السيرفر الرسمي: فحص جلسة السيرفر
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return Boolean(session?.user);
  } catch (_error) {
    // في حال انقطاع الشبكة فجأة يرجع للنظام المحلي
    return localStorage.getItem("athar_admin_logged") === "true";
  }
}

// 2. إنشاء كود وصول جديد (هجين)
export async function createAccessCode(codeData: {
  recipient: string;
  uses: number;
  days: number;
}) {
  const newCode = `ATHAR-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const codePayload = {
    id: Date.now().toString(),
    code: newCode,
    recipient: codeData.recipient || "ممارس ميداني",
    uses: codeData.uses || 1,
    days: codeData.days || 30,
    created_at: new Date().toISOString(),
  };

  // أ) إذا كان السيرفر أونلاين: حفظ الكود سحابياً ليعمل على أجهزة الكل
  if (isCloudConfigured()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("access_codes") as any).insert([
        {
          ...codePayload,
          label: codePayload.recipient,
          max_uses: codePayload.uses,
        },
      ]);
      if (!error) return { success: true, code: newCode, mode: "cloud" as const };
    } catch (_e) {
      console.warn("تعذر الاتصال بالسيرفر السحابي، جاري التحويل للمحلي...");
    }
  }

  // ب) إذا كان أوفلاين / تجريبي: حفظ الكود محلياً في الذاكرة لتجربته فوراً
  const localCodes = JSON.parse(localStorage.getItem("athar_access_codes") || "[]");
  localStorage.setItem("athar_access_codes", JSON.stringify([codePayload, ...localCodes]));

  return { success: true, code: newCode, mode: "local" as const };
}

// 3. التحقق من صلاحية كود المستخدم عند فتحه (هجين)
export async function validateAccessCode(inputCode: string): Promise<boolean> {
  const cleanCode = inputCode.trim().toUpperCase();

  // فحص السيرفر السحابي أولاً
  if (isCloudConfigured()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("access_codes") as any)
        .select("*")
        .eq("code", cleanCode)
        .maybeSingle();

      if (data && !error) return true;
    } catch (_e) {
      // استمرار للفحص المحلي إن تعذر السيرفر
    }
  }

  // فحص الأكواد المحلية المخزنة
  const localCodes = JSON.parse(localStorage.getItem("athar_access_codes") || "[]");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return localCodes.some((item: any) => item.code === cleanCode);
}
