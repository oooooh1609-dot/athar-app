/**
 * Interface strings for the managed camera screen, in the four supported
 * languages. Merged into DICT by i18n-dict.ts. English is the fallback.
 */

export const CAM_DICT: Record<string, Record<string, string>> = {
  en: {
    "cam.chk.inscription": "Straight on, raking light from the side, then from the other side",
    "cam.chk.multilight": "One frame per light direction, camera unmoved between frames",
    "cam.grid": "Grid",
    "cam.timer": "Timer",
    "cam.timer.off": "Off",
    "cam.help": "Shooting guidance",
    "cam.help.general":
      "Hold steady, fill the frame with the object, and keep a scale bar in shot if you plan to measure.",
    "cam.help.close": "Got it",
    "cam.doc.title": "Straighten",
    "cam.doc.note":
      "Drag the four corners onto the corners of the flat surface, then apply to remove the viewing angle.",
    "cam.doc.apply": "Straighten",
    "cam.doc.reset": "Reset corners",
    "cam.doc.skip": "Skip",
    "cam.open": "Open camera",
    "cam.opening": "Opening the camera\u2026",
    "cam.close": "Close",
    "cam.retry": "Retry",
    "cam.shutter": "Take photo",
    "cam.denied": "The camera was blocked. Allow camera access for this site, then press Retry.",
    "cam.unsupported":
      "This browser cannot open the camera. Import a photo from your device instead.",
    "cam.failed": "The camera could not start. Press Retry, or import a photo instead.",
    "cam.interrupted":
      "The camera was interrupted by another app or screen. Press Retry to reopen it.",
    "cam.mode": "Capture mode",
    "cam.mode.rockart": "Rock art",
    "cam.mode.inscription": "Inscription",
    "cam.mode.object3d": "3D object",
    "cam.mode.surface": "Rock surface",
    "cam.hint.rockart":
      "Even, indirect light. Avoid glare. Faint pigment is revealed later by enhancement, not by the camera.",
    "cam.hint.inscription":
      "Use raking light from one side so the carving casts shadow. Keep the surface parallel to the camera.",
    "cam.hint.object3d":
      "Keep the object still and walk around it. Several passes at different heights, overlapping each photo.",
    "cam.hint.surface":
      "Overlapping passes across the panel, left to right then top to bottom. Keep about half of each photo shared with the previous one.",
    "cam.advanced": "Advanced controls",
    "cam.zoom": "Zoom",
    "cam.zoom.hw": "Hardware zoom (this lens)",
    "cam.zoom.digital": "Digital zoom \u2014 the saved photo is cropped, not magnified",
    "cam.torch": "Torch",
    "cam.focus": "Focus",
    "cam.focus.auto": "Continuous",
    "cam.focus.single": "Single",
    "cam.focus.manual": "Manual",
    "cam.noControls":
      "This camera exposes no adjustable lens, focus, torch or exposure controls, so none are shown.",
    "cam.tools": "Preview inspection (software)",
    "cam.tools.note":
      "These are preview aids computed on this device. They are never written into the saved photograph.",
    "cam.loupe": "Focus loupe",
    "cam.peaking": "Focus peaking",
    "cam.histogram": "Histogram",
    "cam.clipping": "Blown highlights",
    "cam.quality": "Frame check",
    "cam.q.ok": "Frame looks usable.",
    "cam.q.blur": "Too blurred \u2014 hold steady or brace the camera.",
    "cam.q.over": "Overexposed \u2014 highlights are losing detail.",
    "cam.q.under": "Underexposed \u2014 add light or a longer exposure.",
    "cam.q.dupe": "Almost the same viewpoint \u2014 move before the next photo.",
    "cam.q.slow": "Move more slowly.",
    "cam.tray": "Photos in this session",
    "cam.use": "Use these photos",
    "cam.useOne": "Use this photo",
    "cam.remove": "Remove",
    "cam.retake": "Retake",
    "cam.auto": "Auto-capture when quality is good",
    "cam.autoNote":
      "Auto-capture only fires on a sharp, well-exposed frame from a changed viewpoint. Manual capture always works.",
    "cam.pause": "Pause",
    "cam.resume": "Resume",
    "cam.paused": "Paused",
    "cam.checklist": "Capture checklist",
    "cam.chk.count": "{n} photo(s) accepted",
    "cam.chk.note":
      "No coverage map is shown: this browser gives no pose tracking or image matching, so any coverage percentage would be invented.",
    "cam.chk.object": "Low pass, eye-level pass, high pass, all the way around",
    "cam.chk.surface": "Left-to-right rows, then top-to-bottom columns, overlapping",
    "cam.lens": "Lens",
    "cam.res": "Frame size",
  },
  ar: {
    "cam.chk.inscription": "من الأمام مباشرة، ثم بإضاءة مائلة من جانب، ثم من الجانب الآخر",
    "cam.chk.multilight": "لقطة لكل اتجاه إضاءة، دون تحريك الكاميرا بين اللقطات",
    "cam.grid": "الشبكة",
    "cam.timer": "المؤقّت",
    "cam.timer.off": "معطّل",
    "cam.help": "إرشادات التصوير",
    "cam.help.general":
      "ثبّت يدك، واملأ الإطار بالقطعة، وأبقِ مسطرة القياس داخل الصورة إن كنت تنوي القياس.",
    "cam.help.close": "فهمت",
    "cam.doc.title": "تعديل الميل",
    "cam.doc.note":
      "اسحب الأركان الأربعة إلى أركان السطح المستوي، ثم طبّق لإزالة أثر زاوية التصوير.",
    "cam.doc.apply": "تعديل",
    "cam.doc.reset": "إعادة الأركان",
    "cam.doc.skip": "تخطٍّ",
    "cam.open": "\u0641\u062a\u062d \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627",
    "cam.opening":
      "\u062c\u0627\u0631\u064d \u0641\u062a\u062d \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627\u2026",
    "cam.close": "\u0625\u063a\u0644\u0627\u0642",
    "cam.retry": "\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629",
    "cam.shutter": "\u062a\u0635\u0648\u064a\u0631",
    "cam.denied":
      "\u0645\u0646\u0639 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627. \u0627\u0633\u0645\u062d \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0642\u0639 \u062b\u0645 \u0627\u0636\u063a\u0637 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
    "cam.unsupported":
      "\u0647\u0630\u0627 \u0627\u0644\u0645\u062a\u0635\u0641\u0651\u062d \u0644\u0627 \u064a\u0641\u062a\u062d \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627. \u0627\u0633\u062a\u0648\u0631\u062f \u0635\u0648\u0631\u0629 \u0645\u0646 \u062c\u0647\u0627\u0632\u0643.",
    "cam.failed":
      "\u062a\u0639\u0630\u0651\u0631 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627. \u0623\u0639\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0623\u0648 \u0627\u0633\u062a\u0648\u0631\u062f \u0635\u0648\u0631\u0629.",
    "cam.interrupted":
      "\u0642\u0627\u0637\u0639 \u062a\u0637\u0628\u064a\u0642 \u0623\u0648 \u0634\u0627\u0634\u0629 \u0623\u062e\u0631\u0649 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627. \u0627\u0636\u063a\u0637 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
    "cam.mode": "\u0646\u0645\u0637 \u0627\u0644\u062a\u0635\u0648\u064a\u0631",
    "cam.mode.rockart":
      "\u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0635\u062e\u0631\u064a\u0629",
    "cam.mode.inscription": "\u0627\u0644\u0646\u0642\u0648\u0634",
    "cam.mode.object3d":
      "\u0645\u062c\u0633\u0645 \u062b\u0644\u0627\u062b\u064a \u0627\u0644\u0623\u0628\u0639\u0627\u062f",
    "cam.mode.surface": "\u0648\u0627\u062c\u0647\u0629 \u0635\u062e\u0631\u064a\u0629",
    "cam.hint.rockart":
      "\u0625\u0636\u0627\u0621\u0629 \u0645\u062a\u0633\u0627\u0648\u064a\u0629 \u063a\u064a\u0631 \u0645\u0628\u0627\u0634\u0631\u0629 \u0648\u062a\u062c\u0646\u0651\u0628 \u0627\u0644\u0648\u0647\u062c. \u062a\u0648\u0636\u064a\u062d \u0627\u0644\u0623\u0635\u0628\u0627\u063a \u0627\u0644\u0628\u0627\u0647\u062a\u0629 \u064a\u062a\u0645 \u0644\u0627\u062d\u0642\u064b\u0627 \u0628\u0627\u0644\u0645\u0639\u0627\u0644\u062c\u0629 \u0648\u0644\u064a\u0633 \u0628\u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627.",
    "cam.hint.inscription":
      "\u0623\u0636\u0626 \u0645\u0646 \u062c\u0627\u0646\u0628 \u0648\u0627\u062d\u062f \u0628\u0632\u0627\u0648\u064a\u0629 \u0645\u0627\u0626\u0644\u0629 \u0644\u064a\u0638\u0647\u0631 \u0639\u0645\u0642 \u0627\u0644\u062d\u0641\u0631\u060c \u0648\u0627\u062c\u0639\u0644 \u0627\u0644\u0633\u0637\u062d \u0645\u0648\u0627\u0632\u064a\u064b\u0627 \u0644\u0644\u0643\u0627\u0645\u064a\u0631\u0627.",
    "cam.hint.object3d":
      "\u0627\u062a\u0631\u0643 \u0627\u0644\u0642\u0637\u0639\u0629 \u062b\u0627\u0628\u062a\u0629 \u0648\u062f\u0631 \u062d\u0648\u0644\u0647\u0627 \u0628\u0639\u062f\u0629 \u062f\u0648\u0631\u0627\u062a \u0639\u0644\u0649 \u0627\u0631\u062a\u0641\u0627\u0639\u0627\u062a \u0645\u062e\u062a\u0644\u0641\u0629 \u0645\u0639 \u062a\u062f\u0627\u062e\u0644 \u0628\u064a\u0646 \u0627\u0644\u0635\u0648\u0631.",
    "cam.hint.surface":
      "\u0645\u0631\u0648\u0631 \u0645\u062a\u062f\u0627\u062e\u0644 \u0639\u0644\u0649 \u0627\u0644\u0648\u0627\u062c\u0647\u0629: \u0635\u0641\u0648\u0641 \u0623\u0641\u0642\u064a\u0629 \u062b\u0645 \u0623\u0639\u0645\u062f\u0629 \u0631\u0623\u0633\u064a\u0629\u060c \u0645\u0639 \u062a\u0634\u0627\u0631\u0643 \u0646\u0635\u0641 \u0643\u0644 \u0635\u0648\u0631\u0629 \u0645\u0639 \u0645\u0627 \u0642\u0628\u0644\u0647\u0627.",
    "cam.advanced": "\u062e\u064a\u0627\u0631\u0627\u062a \u0645\u062a\u0642\u062f\u0645\u0629",
    "cam.zoom": "\u0627\u0644\u062a\u0643\u0628\u064a\u0631",
    "cam.zoom.hw": "\u062a\u0643\u0628\u064a\u0631 \u0628\u0627\u0644\u0639\u062f\u0633\u0629",
    "cam.zoom.digital":
      "\u062a\u0643\u0628\u064a\u0631 \u0631\u0642\u0645\u064a \u2014 \u062a\u064f\u0642\u0637\u0639 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629 \u0648\u0644\u0627 \u062a\u064f\u0643\u0628\u0631 \u0641\u0639\u0644\u064a\u064b\u0627",
    "cam.torch": "\u0627\u0644\u0645\u0635\u0628\u0627\u062d",
    "cam.focus": "\u0627\u0644\u062a\u0631\u0643\u064a\u0632",
    "cam.focus.auto": "\u0645\u0633\u062a\u0645\u0631",
    "cam.focus.single": "\u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629",
    "cam.focus.manual": "\u064a\u062f\u0648\u064a",
    "cam.noControls":
      "\u0647\u0630\u0647 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627 \u0644\u0627 \u062a\u0648\u0641\u0631 \u062a\u062d\u0643\u0645\u064b\u0627 \u0641\u064a \u0627\u0644\u0639\u062f\u0633\u0629 \u0623\u0648 \u0627\u0644\u062a\u0631\u0643\u064a\u0632 \u0623\u0648 \u0627\u0644\u0645\u0635\u0628\u0627\u062d \u0623\u0648 \u0627\u0644\u062a\u0639\u0631\u064a\u0636\u060c \u0644\u0630\u0644\u0643 \u0644\u0627 \u062a\u064f\u0639\u0631\u0636 \u0647\u0630\u0647 \u0627\u0644\u0623\u0632\u0631\u0627\u0631.",
    "cam.tools":
      "\u0623\u062f\u0648\u0627\u062a \u0641\u062d\u0635 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629 (\u0628\u0631\u0645\u062c\u064a\u0629)",
    "cam.tools.note":
      "\u062a\u064f\u062d\u0633\u0628 \u0639\u0644\u0649 \u0627\u0644\u062c\u0647\u0627\u0632 \u0644\u0644\u0645\u0639\u0627\u064a\u0646\u0629 \u0641\u0642\u0637\u060c \u0648\u0644\u0627 \u062a\u064f\u0643\u062a\u0628 \u0623\u0628\u062f\u064b\u0627 \u0641\u064a \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629.",
    "cam.loupe": "\u0645\u0643\u0628\u0651\u0631\u0629 \u0627\u0644\u062a\u0631\u0643\u064a\u0632",
    "cam.peaking":
      "\u0625\u0628\u0631\u0627\u0632 \u062d\u062f\u0648\u062f \u0627\u0644\u062a\u0631\u0643\u064a\u0632",
    "cam.histogram": "\u0627\u0644\u0645\u062f\u0631\u062c \u0627\u0644\u0636\u0648\u0621\u064a",
    "cam.clipping":
      "\u0627\u0644\u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0645\u062d\u062a\u0631\u0642\u0629",
    "cam.quality": "\u0641\u062d\u0635 \u0627\u0644\u0625\u0637\u0627\u0631",
    "cam.q.ok": "\u0627\u0644\u0625\u0637\u0627\u0631 \u0645\u0646\u0627\u0633\u0628.",
    "cam.q.blur":
      "\u0627\u0644\u0635\u0648\u0631\u0629 \u0645\u0634\u0648\u0651\u0634\u0629 \u2014 \u062b\u0628\u0651\u062a \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627.",
    "cam.q.over":
      "\u062a\u0639\u0631\u064a\u0636 \u0632\u0627\u0626\u062f \u2014 \u062a\u0641\u0642\u062f \u0627\u0644\u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0641\u0627\u062a\u062d\u0629 \u062a\u0641\u0627\u0635\u064a\u0644\u0647\u0627.",
    "cam.q.under":
      "\u062a\u0639\u0631\u064a\u0636 \u0646\u0627\u0642\u0635 \u2014 \u0632\u062f \u0627\u0644\u0625\u0636\u0627\u0621\u0629.",
    "cam.q.dupe":
      "\u0627\u0644\u0632\u0627\u0648\u064a\u0629 \u0644\u0645 \u062a\u062a\u063a\u064a\u0631 \u2014 \u062a\u062d\u0631\u0643 \u0642\u0628\u0644 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u062a\u0627\u0644\u064a\u0629.",
    "cam.q.slow": "\u062a\u062d\u0631\u0643 \u0628\u0628\u0637\u0621 \u0623\u0643\u0628\u0631.",
    "cam.tray": "\u0635\u0648\u0631 \u0647\u0630\u0647 \u0627\u0644\u062c\u0644\u0633\u0629",
    "cam.use": "\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0627\u0644\u0635\u0648\u0631",
    "cam.useOne": "\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0627\u0644\u0635\u0648\u0631\u0629",
    "cam.remove": "\u062d\u0630\u0641",
    "cam.retake": "\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0635\u0648\u064a\u0631",
    "cam.auto":
      "\u062a\u0635\u0648\u064a\u0631 \u062a\u0644\u0642\u0627\u0626\u064a \u0639\u0646\u062f \u062c\u0648\u062f\u0629 \u062c\u064a\u062f\u0629",
    "cam.autoNote":
      "\u0644\u0627 \u064a\u0639\u0645\u0644 \u0627\u0644\u062a\u0635\u0648\u064a\u0631 \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a \u0625\u0644\u0627 \u0645\u0639 \u0625\u0637\u0627\u0631 \u062d\u0627\u062f\u0651 \u0648\u062a\u0639\u0631\u064a\u0636 \u0633\u0644\u064a\u0645 \u0648\u0632\u0627\u0648\u064a\u0629 \u0645\u062e\u062a\u0644\u0641\u0629\u060c \u0648\u0627\u0644\u062a\u0635\u0648\u064a\u0631 \u0627\u0644\u064a\u062f\u0648\u064a \u0645\u062a\u0627\u062d \u062f\u0627\u0626\u0645\u064b\u0627.",
    "cam.pause": "\u0625\u064a\u0642\u0627\u0641 \u0645\u0648\u0642\u062a",
    "cam.resume": "\u0645\u062a\u0627\u0628\u0639\u0629",
    "cam.paused": "\u0645\u062a\u0648\u0642\u0641 \u0645\u0648\u0642\u062a\u064b\u0627",
    "cam.checklist": "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062a\u062d\u0642\u0642",
    "cam.chk.count": "{n} \u0635\u0648\u0631\u0629 \u0645\u0642\u0628\u0648\u0644\u0629",
    "cam.chk.note":
      "\u0644\u0627 \u062a\u064f\u0639\u0631\u0636 \u062e\u0631\u064a\u0637\u0629 \u062a\u063a\u0637\u064a\u0629\u061b \u0644\u0623\u0646 \u0627\u0644\u0645\u062a\u0635\u0641\u0651\u062d \u0644\u0627 \u064a\u0648\u0641\u0631 \u062a\u062a\u0628\u0639 \u0645\u0648\u0642\u0639 \u0623\u0648 \u0645\u0637\u0627\u0628\u0642\u0629 \u0635\u0648\u0631\u060c \u0648\u0623\u064a \u0646\u0633\u0628\u0629 \u062a\u063a\u0637\u064a\u0629 \u0633\u062a\u0643\u0648\u0646 \u0645\u062e\u062a\u0644\u0642\u0629.",
    "cam.chk.object":
      "\u062f\u0648\u0631\u0629 \u0645\u0646\u062e\u0641\u0636\u0629\u060c \u0648\u062f\u0648\u0631\u0629 \u0639\u0644\u0649 \u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u0646\u0638\u0631\u060c \u0648\u062f\u0648\u0631\u0629 \u0645\u0631\u062a\u0641\u0639\u0629\u060c \u062d\u0648\u0644 \u0627\u0644\u0642\u0637\u0639\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644",
    "cam.chk.surface":
      "\u0635\u0641\u0648\u0641 \u0645\u0646 \u0627\u0644\u064a\u0645\u064a\u0646 \u0644\u0644\u064a\u0633\u0627\u0631 \u062b\u0645 \u0623\u0639\u0645\u062f\u0629 \u0645\u0646 \u0627\u0644\u0623\u0639\u0644\u0649 \u0644\u0644\u0623\u0633\u0641\u0644\u060c \u0645\u062a\u062f\u0627\u062e\u0644\u0629",
    "cam.lens": "\u0627\u0644\u0639\u062f\u0633\u0629",
    "cam.res": "\u0623\u0628\u0639\u0627\u062f \u0627\u0644\u0625\u0637\u0627\u0631",
  },
  zh: {
    "cam.chk.inscription": "正面拍摄，再从一侧掠射打光，然后换另一侧",
    "cam.chk.multilight": "每个光照方向拍一张，其间不要移动相机",
    "cam.grid": "网格",
    "cam.timer": "定时",
    "cam.timer.off": "关闭",
    "cam.help": "拍摄指引",
    "cam.help.general": "端稳相机，让对象充满画面；若打算测量，请把比例尺一并拍入。",
    "cam.help.close": "知道了",
    "cam.doc.title": "校正",
    "cam.doc.note": "将四个角拖到平面的四角，然后应用以消除拍摄角度的影响。",
    "cam.doc.apply": "校正",
    "cam.doc.reset": "重置四角",
    "cam.doc.skip": "跳过",
    "cam.open": "\u6253\u5f00\u76f8\u673a",
    "cam.opening": "\u6b63\u5728\u6253\u5f00\u76f8\u673a\u2026",
    "cam.close": "\u5173\u95ed",
    "cam.retry": "\u91cd\u8bd5",
    "cam.shutter": "\u62cd\u7167",
    "cam.denied":
      "\u76f8\u673a\u88ab\u7981\u7528\u3002\u8bf7\u5141\u8bb8\u672c\u7ad9\u4f7f\u7528\u76f8\u673a\uff0c\u7136\u540e\u70b9\u51fb\u201c\u91cd\u8bd5\u201d\u3002",
    "cam.unsupported":
      "\u6b64\u6d4f\u89c8\u5668\u65e0\u6cd5\u6253\u5f00\u76f8\u673a\u3002\u8bf7\u4ece\u8bbe\u5907\u5bfc\u5165\u7167\u7247\u3002",
    "cam.failed":
      "\u76f8\u673a\u65e0\u6cd5\u542f\u52a8\u3002\u8bf7\u91cd\u8bd5\u6216\u5bfc\u5165\u7167\u7247\u3002",
    "cam.interrupted":
      "\u76f8\u673a\u88ab\u5176\u4ed6\u5e94\u7528\u6216\u9875\u9762\u4e2d\u65ad\u3002\u8bf7\u70b9\u51fb\u201c\u91cd\u8bd5\u201d\u3002",
    "cam.mode": "\u62cd\u6444\u6a21\u5f0f",
    "cam.mode.rockart": "\u5ca9\u753b",
    "cam.mode.inscription": "\u9898\u94ed",
    "cam.mode.object3d": "\u4e09\u7ef4\u7269\u4f53",
    "cam.mode.surface": "\u5ca9\u9762",
    "cam.hint.rockart":
      "\u4f7f\u7528\u5747\u5300\u7684\u95f4\u63a5\u5149\uff0c\u907f\u5f00\u53cd\u5149\u3002\u6de1\u8272\u989c\u6599\u7531\u540e\u671f\u589e\u5f3a\u663e\u73b0\uff0c\u800c\u975e\u76f8\u673a\u3002",
    "cam.hint.inscription":
      "\u4ece\u4e00\u4fa7\u4f7f\u7528\u659c\u5c04\u5149\uff0c\u4f7f\u523b\u75d5\u4ea7\u751f\u9634\u5f71\uff1b\u4fdd\u6301\u8868\u9762\u4e0e\u76f8\u673a\u5e73\u884c\u3002",
    "cam.hint.object3d":
      "\u4fdd\u6301\u7269\u4f53\u4e0d\u52a8\uff0c\u7ed5\u5176\u884c\u8d70\uff0c\u5728\u4e0d\u540c\u9ad8\u5ea6\u62cd\u591a\u5468\uff0c\u7167\u7247\u4e4b\u95f4\u8981\u6709\u91cd\u53e0\u3002",
    "cam.hint.surface":
      "\u5bf9\u5ca9\u9762\u505a\u91cd\u53e0\u626b\u63cf\uff1a\u5148\u6a2a\u6392\u540e\u7ad6\u6392\uff0c\u6bcf\u5f20\u4e0e\u524d\u4e00\u5f20\u91cd\u53e0\u7ea6\u4e00\u534a\u3002",
    "cam.advanced": "\u9ad8\u7ea7\u63a7\u5236",
    "cam.zoom": "\u53d8\u7126",
    "cam.zoom.hw": "\u786c\u4ef6\u53d8\u7126",
    "cam.zoom.digital":
      "\u6570\u5b57\u53d8\u7126 \u2014 \u4fdd\u5b58\u7684\u7167\u7247\u662f\u88c1\u5207\u800c\u975e\u771f\u6b63\u653e\u5927",
    "cam.torch": "\u624b\u7535\u7b52",
    "cam.focus": "\u5bf9\u7126",
    "cam.focus.auto": "\u8fde\u7eed",
    "cam.focus.single": "\u5355\u6b21",
    "cam.focus.manual": "\u624b\u52a8",
    "cam.noControls":
      "\u6b64\u76f8\u673a\u672a\u63d0\u4f9b\u53ef\u8c03\u7684\u955c\u5934\u3001\u5bf9\u7126\u3001\u624b\u7535\u7b52\u6216\u66dd\u5149\u63a7\u5236\uff0c\u56e0\u6b64\u4e0d\u663e\u793a\u3002",
    "cam.tools": "\u9884\u89c8\u68c0\u67e5\uff08\u8f6f\u4ef6\uff09",
    "cam.tools.note":
      "\u8fd9\u4e9b\u5de5\u5177\u5728\u672c\u8bbe\u5907\u8ba1\u7b97\uff0c\u4ec5\u7528\u4e8e\u9884\u89c8\uff0c\u7edd\u4e0d\u5199\u5165\u4fdd\u5b58\u7684\u7167\u7247\u3002",
    "cam.loupe": "\u5bf9\u7126\u653e\u5927\u955c",
    "cam.peaking": "\u5bf9\u7126\u5cf0\u503c",
    "cam.histogram": "\u76f4\u65b9\u56fe",
    "cam.clipping": "\u9ad8\u5149\u8fc7\u66dd",
    "cam.quality": "\u753b\u9762\u68c0\u67e5",
    "cam.q.ok": "\u753b\u9762\u53ef\u7528\u3002",
    "cam.q.blur": "\u8fc7\u4e8e\u6a21\u7cca \u2014 \u8bf7\u7a33\u4f4f\u76f8\u673a\u3002",
    "cam.q.over": "\u66dd\u5149\u8fc7\u5ea6 \u2014 \u9ad8\u5149\u4e22\u5931\u7ec6\u8282\u3002",
    "cam.q.under": "\u66dd\u5149\u4e0d\u8db3 \u2014 \u8bf7\u589e\u52a0\u5149\u7ebf\u3002",
    "cam.q.dupe":
      "\u89c6\u89d2\u51e0\u4e4e\u672a\u53d8 \u2014 \u62cd\u4e0b\u4e00\u5f20\u524d\u8bf7\u79fb\u52a8\u3002",
    "cam.q.slow": "\u8bf7\u653e\u6162\u79fb\u52a8\u3002",
    "cam.tray": "\u672c\u6b21\u4f1a\u8bdd\u7684\u7167\u7247",
    "cam.use": "\u4f7f\u7528\u8fd9\u4e9b\u7167\u7247",
    "cam.useOne": "\u4f7f\u7528\u6b64\u7167\u7247",
    "cam.remove": "\u5220\u9664",
    "cam.retake": "\u91cd\u62cd",
    "cam.auto": "\u8d28\u91cf\u826f\u597d\u65f6\u81ea\u52a8\u62cd\u6444",
    "cam.autoNote":
      "\u81ea\u52a8\u62cd\u6444\u4ec5\u5728\u753b\u9762\u6e05\u6670\u3001\u66dd\u5149\u5f97\u5f53\u4e14\u89c6\u89d2\u5df2\u53d8\u65f6\u89e6\u53d1\uff1b\u624b\u52a8\u62cd\u6444\u59cb\u7ec8\u53ef\u7528\u3002",
    "cam.pause": "\u6682\u505c",
    "cam.resume": "\u7ee7\u7eed",
    "cam.paused": "\u5df2\u6682\u505c",
    "cam.checklist": "\u62cd\u6444\u6e05\u5355",
    "cam.chk.count": "\u5df2\u63a5\u53d7 {n} \u5f20\u7167\u7247",
    "cam.chk.note":
      "\u4e0d\u663e\u793a\u8986\u76d6\u7387\uff1a\u6d4f\u89c8\u5668\u65e0\u4f4d\u59ff\u8ddf\u8e2a\u6216\u56fe\u50cf\u5339\u914d\uff0c\u4efb\u4f55\u767e\u5206\u6bd4\u90fd\u662f\u7f16\u9020\u7684\u3002",
    "cam.chk.object":
      "\u4f4e\u4f4d\u4e00\u5468\u3001\u5e73\u89c6\u4e00\u5468\u3001\u9ad8\u4f4d\u4e00\u5468\uff0c\u7ed5\u6ee1\u5168\u5468",
    "cam.chk.surface": "\u5148\u6a2a\u6392\u518d\u7ad6\u6392\uff0c\u4e14\u4e92\u76f8\u91cd\u53e0",
    "cam.lens": "\u955c\u5934",
    "cam.res": "\u753b\u5e45\u5c3a\u5bf8",
  },
  fr: {
    "cam.chk.inscription": "De face, puis en lumière rasante d’un côté, puis de l’autre",
    "cam.chk.multilight":
      "Une image par direction d’éclairage, sans bouger l’appareil entre les prises",
    "cam.grid": "Grille",
    "cam.timer": "Retardateur",
    "cam.timer.off": "Désactivé",
    "cam.help": "Conseils de prise de vue",
    "cam.help.general":
      "Tenez l’appareil fermement, remplissez le cadre avec l’objet, et gardez une mire dans l’image si vous comptez mesurer.",
    "cam.help.close": "Compris",
    "cam.doc.title": "Redresser",
    "cam.doc.note":
      "Faites glisser les quatre coins sur ceux de la surface plane, puis appliquez pour supprimer l’angle de prise de vue.",
    "cam.doc.apply": "Redresser",
    "cam.doc.reset": "Réinitialiser les coins",
    "cam.doc.skip": "Passer",
    "cam.open": "Ouvrir l\u2019appareil photo",
    "cam.opening": "Ouverture de l\u2019appareil photo\u2026",
    "cam.close": "Fermer",
    "cam.retry": "R\u00e9essayer",
    "cam.shutter": "Prendre une photo",
    "cam.denied":
      "L\u2019appareil photo est bloqu\u00e9. Autorisez-le pour ce site, puis appuyez sur R\u00e9essayer.",
    "cam.unsupported":
      "Ce navigateur ne peut pas ouvrir l\u2019appareil photo. Importez une photo depuis votre appareil.",
    "cam.failed":
      "L\u2019appareil photo n\u2019a pas d\u00e9marr\u00e9. R\u00e9essayez ou importez une photo.",
    "cam.interrupted":
      "Une autre application ou un autre \u00e9cran a interrompu l\u2019appareil photo. Appuyez sur R\u00e9essayer.",
    "cam.mode": "Mode de prise de vue",
    "cam.mode.rockart": "Art rupestre",
    "cam.mode.inscription": "Inscription",
    "cam.mode.object3d": "Objet 3D",
    "cam.mode.surface": "Paroi rocheuse",
    "cam.hint.rockart":
      "Lumi\u00e8re indirecte et r\u00e9guli\u00e8re, sans reflet. Les pigments p\u00e2les sont r\u00e9v\u00e9l\u00e9s ensuite par le traitement, pas par l\u2019appareil.",
    "cam.hint.inscription":
      "\u00c9clairez en lumi\u00e8re rasante d\u2019un seul c\u00f4t\u00e9 pour que la gravure porte une ombre. Gardez la surface parall\u00e8le \u00e0 l\u2019appareil.",
    "cam.hint.object3d":
      "Laissez l\u2019objet immobile et tournez autour : plusieurs passages \u00e0 des hauteurs diff\u00e9rentes, avec recouvrement.",
    "cam.hint.surface":
      "Passages avec recouvrement sur la paroi : rang\u00e9es horizontales puis colonnes verticales, environ la moiti\u00e9 en commun.",
    "cam.advanced": "R\u00e9glages avanc\u00e9s",
    "cam.zoom": "Zoom",
    "cam.zoom.hw": "Zoom mat\u00e9riel",
    "cam.zoom.digital":
      "Zoom num\u00e9rique \u2014 la photo enregistr\u00e9e est recadr\u00e9e, non agrandie",
    "cam.torch": "Torche",
    "cam.focus": "Mise au point",
    "cam.focus.auto": "Continue",
    "cam.focus.single": "Unique",
    "cam.focus.manual": "Manuelle",
    "cam.noControls":
      "Cet appareil n\u2019expose aucun r\u00e9glage d\u2019objectif, de mise au point, de torche ou d\u2019exposition : aucun n\u2019est donc affich\u00e9.",
    "cam.tools": "Inspection de l\u2019aper\u00e7u (logicielle)",
    "cam.tools.note":
      "Ces aides sont calcul\u00e9es sur cet appareil pour l\u2019aper\u00e7u seulement ; elles ne sont jamais inscrites dans la photo enregistr\u00e9e.",
    "cam.loupe": "Loupe de mise au point",
    "cam.peaking": "Focus peaking",
    "cam.histogram": "Histogramme",
    "cam.clipping": "Hautes lumi\u00e8res br\u00fbl\u00e9es",
    "cam.quality": "Contr\u00f4le de l\u2019image",
    "cam.q.ok": "Image exploitable.",
    "cam.q.blur": "Trop floue \u2014 stabilisez l\u2019appareil.",
    "cam.q.over": "Surexpos\u00e9e \u2014 les hautes lumi\u00e8res perdent leur d\u00e9tail.",
    "cam.q.under": "Sous-expos\u00e9e \u2014 ajoutez de la lumi\u00e8re.",
    "cam.q.dupe":
      "Point de vue presque identique \u2014 d\u00e9placez-vous avant la photo suivante.",
    "cam.q.slow": "D\u00e9placez-vous plus lentement.",
    "cam.tray": "Photos de cette session",
    "cam.use": "Utiliser ces photos",
    "cam.useOne": "Utiliser cette photo",
    "cam.remove": "Supprimer",
    "cam.retake": "Reprendre",
    "cam.auto": "Prise automatique si la qualit\u00e9 est bonne",
    "cam.autoNote":
      "La prise automatique ne se d\u00e9clenche que sur une image nette, bien expos\u00e9e et depuis un point de vue diff\u00e9rent. La prise manuelle reste toujours possible.",
    "cam.pause": "Pause",
    "cam.resume": "Reprendre",
    "cam.paused": "En pause",
    "cam.checklist": "Liste de contr\u00f4le",
    "cam.chk.count": "{n} photo(s) accept\u00e9e(s)",
    "cam.chk.note":
      "Aucune carte de couverture n\u2019est affich\u00e9e : le navigateur ne fournit ni suivi de pose ni mise en correspondance d\u2019images, donc tout pourcentage serait invent\u00e9.",
    "cam.chk.object":
      "Un tour bas, un tour \u00e0 hauteur d\u2019\u0153il, un tour haut, tout autour",
    "cam.chk.surface":
      "Rang\u00e9es de gauche \u00e0 droite, puis colonnes de haut en bas, avec recouvrement",
    "cam.lens": "Objectif",
    "cam.res": "Taille d\u2019image",
  },
};
