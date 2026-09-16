export class Server3DService {
  private baseUrl = "https://jackkhaled-athar-3d.hf.space";

  public async generate3D(canvas: HTMLCanvasElement): Promise<string> {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("تعذر تحويل بيانات الكانفاس إلى صورة"))),
        "image/jpeg",
        0.95,
      );
    });

    const formData = new FormData();
    formData.append("image", blob, "artifact.jpg");

    const res = await fetch(`${this.baseUrl}/api/predict`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`خطأ استجابة السيرفر: ${res.status}`);
    }

    const data = await res.json();
    if (data.status !== "completed" || !data.modelUrl) {
      throw new Error(data.error || "فشلت معالجة المجسم على السيرفر");
    }

    return data.modelUrl;
  }
}
