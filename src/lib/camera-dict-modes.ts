/**
 * Extra camera strings for the per-mode workflows (photo, multi-light,
 * document scan), the Help sheet, the grid and the self-timer, in the four
 * supported languages. Merged into DICT by i18n-dict.ts; English is the
 * fallback.
 */

export const CAM_MODE_DICT: Record<string, Record<string, string>> = {
  en: {
    "cam.mode.photo": "Photo",
    "cam.mode.multilight": "Multi-light",
    "cam.mode.document": "Document",
    "cam.hint.photo":
      "Plain capture. Zoom, focus, torch, grid and timer are available when this camera supports them.",
    "cam.hint.multilight":
      "Keep the camera completely still — a tripod or a wedged phone. Move only the lamp between photographs.",
    "cam.hint.document":
      "Fill the frame with the page, keep it flat and evenly lit. You can straighten the corners after the shot.",
    "cam.help": "Help",
    "cam.help.close": "Close help",
    "cam.help.general":
      "Overlays such as the histogram, peaking and loupe are preview aids only and are never written into the saved photograph. Digital zoom crops the saved photograph by exactly the factor shown.",
    "cam.help.photo":
      "A single photograph with the controls this camera really supports. Nothing is enhanced or reconstructed in this mode.",
    "cam.help.rockart":
      "Photograph the panel in even, indirect light and keep the original. Pigment enhancement (including decorrelation stretch) runs afterwards on the Enhance screen, with a before/after comparison and an intensity slider. Enhanced results are false colour, not the original pigment colours.",
    "cam.help.inscription":
      "Get close and sharp, with light raking across the carving from one side. Take several lighting views of the same fixed framing, plus detail crops. The original photograph stays available for AI analysis.",
    "cam.help.object3d":
      "A 360\u00b0 object scan needs the object to stay still while you walk around it, photographing every 15\u201320\u00b0 with generous overlap, in a middle pass and — where you can reach — an upper and a lower pass. Rotating the phone on the spot, or a single panoramic photo, cannot reconstruct an object: the camera must actually change position. When you finish, the set is sent to the self-hosted Meshroom pipeline on your own computer; the real job states appear on the 3D screen and your photographs are kept if a job fails.",
    "cam.help.surface":
      "Photograph a large panel as overlapping rows, about half of each frame shared with the previous one. A stitched flat image and a reconstructed 3D surface are different outputs: only what the connected pipeline actually produces is offered.",
    "cam.help.multilight":
      "Fix the camera and the subject, then photograph the same framing with the lamp in different directions — for example eight positions around the piece at a low angle. You can compare the lighting views side by side. Interactive RTI relighting is not offered, because no RTI processing pipeline is connected; a contrast filter is not RTI.",
    "cam.help.document":
      "Photograph the page flat and fill the frame. After the shot you can drag the four corners and apply a perspective correction, then export the straightened image. Text recognition (OCR) is not connected in this mode, so no transcription is produced here.",
    "cam.grid": "Composition grid",
    "cam.timer": "Self-timer",
    "cam.timer.off": "Off",
    "cam.chk.multilight": "Same framing every time; only the lamp moves",
    "cam.chk.inscription": "Sharp close view, raking light, plus detail crops",
    "cam.doc.title": "Straighten the page",
    "cam.doc.note":
      "Drag each corner onto a corner of the page, then apply the correction. Automatic edge detection is not implemented, so the corners are placed by hand.",
    "cam.doc.apply": "Apply correction",
    "cam.doc.reset": "Reset corners",
    "cam.doc.skip": "Keep the original",
  },
  ar: {
    "cam.mode.photo": "صورة",
    "cam.mode.multilight": "إضاءات متعددة",
    "cam.mode.document": "مستند",
    "cam.hint.photo":
      "تصوير بسيط. التكبير والتركيز والإضاءة والشبكة والمؤقت تظهر إذا دعمتها الكاميرا.",
    "cam.hint.multilight": "ثبّت الكاميرا تمامًا — حامل أو سطح ثابت. حرّك المصباح فقط بين الصور.",
    "cam.hint.document":
      "املأ الإطار بالصفحة، وابقها مستوية وبإضاءة متساوية. يمكنك تعديل الزوايا بعد التصوير.",
    "cam.help": "مساعدة",
    "cam.help.close": "إغلاق المساعدة",
    "cam.help.general":
      "الرسوم المساعدة مثل المدرج والتحديد والعدسة المكبّرة أدوات معاينة فقط ولا تُكتب داخل الصورة المحفوظة. التكبير الرقمي يقتطع الصورة المحفوظة بالنسبة المعروضة نفسها.",
    "cam.help.photo":
      "صورة واحدة بالأدوات التي تدعمها الكاميرا فعلًا. لا يوجد تحسين ولا إعادة بناء في هذا النمط.",
    "cam.help.rockart":
      "صوّر اللوحة بإضاءة غير مباشرة متساوية واحفظ الأصل. تحسين الأصباغ (بما فيه decorrelation stretch) يتم بعد ذلك في شاشة التحسين مع مقارنة قبل/بعد ومنزلق شدة. النتائج المحسّنة ألوان زائفة وليست ألوان الصبغة الأصلية.",
    "cam.help.inscription":
      "اقترب وصوّر بحدة، مع ضوء مائل من جهة واحدة على النقر. خذ عدة صور بإضاءات مختلفة للإطار الثابت نفسه، مع تفاصيل مقرّبة. تبقى الصورة الأصلية متاحة للتحليل.",
    "cam.help.object3d":
      "تصوير ٣٦٠° يعني أن القطعة تبقى ثابتة وأنت تدور حولها وتصوّر كل ١٥–٢٠ درجة بتداخل كبير، في مسار أوسط، ومسار أعلى وأسفل إن أمكن. تدوير الجوال في مكانه أو صورة بانورامية واحدة لا يكفي لإعادة بناء القطعة؛ يجب أن ينتقل موضع الكاميرا فعلًا. عند الانتهاء تُرسل المجموعة إلى معالجة Meshroom على كمبيوترك، وتظهر حالات المهمة الحقيقية في شاشة النموذج، وتُحفظ صورك إن فشلت المهمة.",
    "cam.help.surface":
      "صوّر اللوحة الكبيرة صفوفًا متداخلة، بحيث يشترك نحو نصف كل صورة مع سابقتها. الصورة المسطحة المدمجة والسطح ثلاثي الأبعاد ناتجان مختلفان: لا يُعرض إلا ما تنتجه المعالجة المتصلة فعلًا.",
    "cam.help.multilight":
      "ثبّت الكاميرا والقطعة، ثم صوّر الإطار نفسه والمصباح في اتجاهات مختلفة — مثلًا ثماني مواضع حول القطعة بزاوية منخفضة. يمكنك مقارنة صور الإضاءة. لا تُعرض إضاءة RTI التفاعلية لعدم وجود معالجة RTI متصلة؛ ومرشّح التباين ليس RTI.",
    "cam.help.document":
      "صوّر الصفحة مستوية واملأ الإطار. بعد التصوير يمكنك سحب الزوايا الأربع وتطبيق تصحيح المنظور ثم تصدير الصورة المستقيمة. التعرف على النص (OCR) غير متصل في هذا النمط، فلا يُنتج أي نص هنا.",
    "cam.grid": "شبكة التكوين",
    "cam.timer": "المؤقت الذاتي",
    "cam.timer.off": "إيقاف",
    "cam.chk.multilight": "الإطار نفسه كل مرة؛ المصباح وحده يتحرك",
    "cam.chk.inscription": "منظر قريب حاد، ضوء مائل، مع تفاصيل مقرّبة",
    "cam.doc.title": "تصحيح استقامة الصفحة",
    "cam.doc.note":
      "اسحب كل زاوية إلى زاوية الصفحة ثم طبّق التصحيح. الكشف التلقائي للحواف غير منفّذ، لذلك تُحدَّد الزوايا يدويًا.",
    "cam.doc.apply": "تطبيق التصحيح",
    "cam.doc.reset": "إعادة الزوايا",
    "cam.doc.skip": "الإبقاء على الأصل",
  },
  zh: {
    "cam.mode.photo": "照片",
    "cam.mode.multilight": "多光源",
    "cam.mode.document": "文档",
    "cam.hint.photo": "普通拍摄。相机支持时可用变焦、对焦、闪光灯、网格与定时器。",
    "cam.hint.multilight": "相机必须完全固定（三脚架或稳固支撑），两次拍摄之间只移动灯光。",
    "cam.hint.document": "让页面填满画面，保持平整、光照均匀。拍摄后可以调整四角。",
    "cam.help": "帮助",
    "cam.help.close": "关闭帮助",
    "cam.help.general":
      "直方图、峰值对焦与放大镜等叠加层仅为预览辅助，绝不会写入保存的照片。数字变焦按屏幕显示的倍数裁切保存的照片。",
    "cam.help.photo": "使用相机真正支持的控件拍摄单张照片。此模式不做增强或重建。",
    "cam.help.rockart":
      "在均匀的间接光下拍摄并保留原片。颜料增强（含去相关拉伸）随后在增强界面进行，提供前后对比与强度滑块。增强结果为伪彩色，并非原始颜料颜色。",
    "cam.help.inscription":
      "靠近拍清晰，让光从一侧斜掠刻痕。对同一固定构图拍摄多张不同光照，并拍摄细节特写。原始照片仍可用于分析。",
    "cam.help.object3d":
      "360° 物体扫描需要物体静止，而你绕着它走动，每 15–20° 拍一张并保持大量重叠，包含中间一圈，条件允许时再加高、低两圈。原地旋转手机或拍一张全景都无法重建物体：相机位置必须真正改变。完成后照片集会提交到你自己电脑上的 Meshroom 处理，真实任务状态显示在三维界面；任务失败时照片仍会保留。",
    "cam.help.surface":
      "把大面岩壁拍成重叠的多行，每张与上一张约有一半重叠。拼接的平面图像与重建的三维表面是两种不同结果：只提供已连接处理流程真正能产出的输出。",
    "cam.help.multilight":
      "固定相机与对象，在灯光位于不同方向时拍摄同一构图——例如以低角度环绕八个位置。可以并排比较各光照结果。由于未连接 RTI 处理流程，不提供交互式 RTI 重照明；对比度滤镜不是 RTI。",
    "cam.help.document":
      "把页面拍平并填满画面。拍摄后可拖动四角并应用透视校正，然后导出校正后的图像。此模式未连接文字识别（OCR），因此不会生成文本。",
    "cam.grid": "构图网格",
    "cam.timer": "自拍定时器",
    "cam.timer.off": "关闭",
    "cam.chk.multilight": "构图每次相同；只移动灯光",
    "cam.chk.inscription": "清晰近景、斜掠光，加细节特写",
    "cam.doc.title": "校正页面",
    "cam.doc.note":
      "把每个角拖到页面的角上，然后应用校正。未实现自动边缘检测，因此需要手动放置四角。",
    "cam.doc.apply": "应用校正",
    "cam.doc.reset": "重置四角",
    "cam.doc.skip": "保留原图",
  },
  fr: {
    "cam.mode.photo": "Photo",
    "cam.mode.multilight": "Multi-éclairage",
    "cam.mode.document": "Document",
    "cam.hint.photo":
      "Prise de vue simple. Zoom, mise au point, torche, grille et retardateur apparaissent si l’appareil les prend en charge.",
    "cam.hint.multilight":
      "Gardez l’appareil parfaitement immobile (trépied ou support stable). Ne déplacez que la lampe entre les photos.",
    "cam.hint.document":
      "Remplissez le cadre avec la page, à plat et sous un éclairage régulier. Les coins se corrigent après la prise.",
    "cam.help": "Aide",
    "cam.help.close": "Fermer l’aide",
    "cam.help.general":
      "L’histogramme, le focus peaking et la loupe sont de simples aides d’aperçu et ne sont jamais inscrits dans la photo enregistrée. Le zoom numérique recadre la photo enregistrée exactement selon le facteur affiché.",
    "cam.help.photo":
      "Une seule photo avec les commandes réellement prises en charge. Aucun traitement ni reconstruction dans ce mode.",
    "cam.help.rockart":
      "Photographiez le panneau sous une lumière indirecte régulière et conservez l’original. Le rehaussement des pigments (dont le decorrelation stretch) s’effectue ensuite sur l’écran d’amélioration, avec comparaison avant/après et curseur d’intensité. Les résultats sont en fausses couleurs, non les couleurs d’origine.",
    "cam.help.inscription":
      "Approchez-vous, cadrez net, avec une lumière rasante d’un seul côté. Prenez plusieurs éclairages du même cadrage fixe, plus des détails. La photo originale reste disponible pour l’analyse.",
    "cam.help.object3d":
      "Un scan 360° exige que l’objet reste immobile pendant que vous tournez autour, en photographiant tous les 15–20° avec un large recouvrement : une passe médiane et, si possible, une passe haute et une passe basse. Faire pivoter le téléphone sur place ou prendre une seule panoramique ne permet pas de reconstruire l’objet : la position de l’appareil doit réellement changer. À la fin, la série part vers le traitement Meshroom hébergé sur votre propre ordinateur ; les états réels de la tâche apparaissent sur l’écran 3D et vos photos sont conservées en cas d’échec.",
    "cam.help.surface":
      "Photographiez un grand panneau en rangées qui se recouvrent d’environ la moitié de chaque image. Une image plane assemblée et une surface 3D reconstruite sont deux résultats distincts : seuls les rendus réellement produits par le traitement connecté sont proposés.",
    "cam.help.multilight":
      "Fixez l’appareil et le sujet, puis photographiez le même cadrage avec la lampe dans différentes directions — par exemple huit positions à angle rasant. Vous pouvez comparer les éclairages. Aucun relighting RTI interactif n’est proposé, faute de traitement RTI connecté ; un filtre de contraste n’est pas du RTI.",
    "cam.help.document":
      "Photographiez la page à plat en remplissant le cadre. Ensuite, déplacez les quatre coins, appliquez la correction de perspective et exportez l’image redressée. La reconnaissance de texte (OCR) n’est pas connectée ici : aucun texte n’est produit.",
    "cam.grid": "Grille de composition",
    "cam.timer": "Retardateur",
    "cam.timer.off": "Désactivé",
    "cam.chk.multilight": "Cadrage identique à chaque fois ; seule la lampe bouge",
    "cam.chk.inscription": "Vue rapprochée nette, lumière rasante, plus des détails",
    "cam.doc.title": "Redresser la page",
    "cam.doc.note":
      "Placez chaque coin sur un coin de la page, puis appliquez la correction. La détection automatique des bords n’est pas implémentée : les coins sont placés à la main.",
    "cam.doc.apply": "Appliquer la correction",
    "cam.doc.reset": "Réinitialiser les coins",
    "cam.doc.skip": "Conserver l’original",
  },
};
