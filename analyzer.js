const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu;
const CONTACT_DETAILS = /(?:https?:\/\/|www\.)\S+|\b\S+@\S+\b|\+?\d[\d\s().-]{5,}\d/giu;
const WORDS = /\p{L}[\p{L}\p{M}]*/gu;

const STOP_WORDS = new Set([
  // Common Arabic function words that do not describe a candidate's skills.
  "أن",
  "أو",
  "أي",
  "إلى",
  "إذا",
  "التي",
  "الذي",
  "الذين",
  "عن",
  "على",
  "في",
  "فيها",
  "كل",
  "كما",
  "لا",
  "لدى",
  "له",
  "لها",
  "ما",
  "مع",
  "من",
  "هذا",
  "هذه",
  "هو",
  "هي",
  "و",
  "نحن",
  "يجب",
  "يكون",
  "تكون",
  "مطلوب",
  "مطلوبة",
  "نبحث",
  "خبرة",
  // Common English function words for bilingual descriptions.
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "this",
  "to",
  "we",
  "will",
  "with",
  "you",
  "your",
  "required",
  "experience",
]);

export class AnalyzerInputError extends TypeError {
  constructor(field, code, message) {
    super(message);
    this.name = "AnalyzerInputError";
    this.field = field;
    this.code = code;
  }
}

function requireText(value, field, code, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AnalyzerInputError(field, code, message);
  }
}

function normalize(text) {
  return text
    .replace(CONTACT_DETAILS, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, "")
    .replace(/\u0640/gu, "");
}

function meaningfulTerms(text) {
  const terms = normalize(text).match(WORDS) ?? [];
  return [...new Set(terms.filter((term) => term.length > 1 && !STOP_WORDS.has(term)))];
}

function recommendationFor(score) {
  if (score === 100) {
    return "توافق ممتاز؛ راجع الصياغة النهائية قبل التقديم.";
  }

  if (score >= 70) {
    return "توافق جيد؛ أضف الكلمات المفقودة التي تعكس خبرتك فعلًا.";
  }

  if (score >= 40) {
    return "توافق متوسط؛ أبرز الخبرات المرتبطة بالمتطلبات المفقودة.";
  }

  return "التوافق منخفض؛ خصّص السيرة للمهارات المطلوبة دون مبالغة.";
}

/**
 * Compares CV text with a job description without network, storage, or logging.
 * Returned terms originate only from the job description, never from CV-only text.
 */
export function analyzeCv(cvText, jobText) {
  requireText(
    cvText,
    "cvText",
    "CV_TEXT_REQUIRED",
    "يجب إدخال نص السيرة الذاتية.",
  );
  requireText(
    jobText,
    "jobText",
    "JOB_TEXT_REQUIRED",
    "يجب إدخال نص الوصف الوظيفي.",
  );

  const cvTerms = new Set(meaningfulTerms(cvText));
  const jobTerms = meaningfulTerms(jobText);
  const matchedTerms = jobTerms.filter((term) => cvTerms.has(term));
  const missingTerms = jobTerms.filter((term) => !cvTerms.has(term));
  const score = jobTerms.length === 0
    ? 0
    : Math.round((matchedTerms.length / jobTerms.length) * 100);

  return {
    score,
    matchedTerms,
    missingTerms,
    recommendation: recommendationFor(score),
  };
}
