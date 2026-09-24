const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu;
const CONTACT_DETAILS = /(?:https?:\/\/|www\.)\S+|\b\S+@\S+\b|\+?\d[\d\s().-]{5,}\d/giu;
const WORDS = /\p{L}[\p{L}\p{M}]*/gu;

function canonicalWord(value) {
  let word = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, "")
    .replace(/\u0640/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه");

  if (/^[وف]/u.test(word) && word.length > 3) word = word.slice(1);
  for (const prefix of ["بال", "كال", "لل", "ال"]) {
    if (word.startsWith(prefix) && word.length - prefix.length >= 3) {
      word = word.slice(prefix.length);
      break;
    }
  }
  return word;
}

const STOP_WORDS = new Set([
  "أن", "أو", "أي", "إلى", "إذا", "التي", "الذي", "الذين", "عن", "على",
  "في", "فيها", "كل", "كما", "لا", "لدى", "له", "لها", "ما", "مع", "من",
  "هذا", "هذه", "هو", "هي", "نحن", "يجب", "يكون", "تكون", "مطلوب", "مطلوبة",
  "نبحث", "خبرة", "محلل", "أعمال", "يجيد", "تشمل", "المسؤوليات", "المشاركة",
  "مبادرات", "إجادة", "اللغة", "مهارة", "تعد", "معرفة", "ميزة", "إضافية", "باستخدام",
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is",
  "it", "of", "on", "or", "our", "that", "the", "their", "this", "to", "we", "will",
  "with", "you", "your", "required", "experience",
].map(canonicalWord));

const SKILL_PHRASES = [
  ["تحليل", "المتطلبات"],
  ["تحليل", "البيانات"],
  ["إدارة", "المشاريع"],
  ["أصحاب", "المصلحة"],
  ["توثيق", "إجراءات", "العمل"],
  ["إعداد", "التقارير"],
  ["لوحات", "المعلومات"],
  ["power", "bi"],
  ["التحول", "الرقمي"],
  ["إدارة", "المخاطر"],
  ["الإنجليزية"],
  ["sql"],
].map((phrase) => phrase.map(canonicalWord));

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

function tokenize(text) {
  return (text.replace(CONTACT_DETAILS, " ").match(WORDS) ?? []).map((label) => ({
    label,
    key: canonicalWord(label),
  }));
}

function sameWord(actual, expected) {
  return actual === expected
    || (/^[بك]/u.test(actual) && actual.slice(1) === expected)
    || (expected === "اعداد" && ["اعدت", "اعددت"].includes(actual));
}

function findPhraseStarts(tokens, phrase) {
  const starts = [];
  for (let start = 0; start <= tokens.length - phrase.length; start += 1) {
    if (phrase.every((word, offset) => sameWord(tokens[start + offset].key, word))) starts.push(start);
  }
  return starts;
}

function findPhrase(tokens, phrase) {
  return findPhraseStarts(tokens, phrase)[0] ?? -1;
}

function jobRequirements(jobText) {
  const tokens = tokenize(jobText);
  const covered = new Set();
  const requirements = [];

  for (const phrase of SKILL_PHRASES) {
    const starts = findPhraseStarts(tokens, phrase);
    const start = starts.find((candidate) => (
      phrase.every((_, offset) => !covered.has(candidate + offset))
    ));
    if (start === undefined) continue;
    for (const occurrence of starts) {
      phrase.forEach((_, offset) => covered.add(occurrence + offset));
    }
    requirements.push({
      start,
      keys: phrase,
      label: phrase.map((_, offset) => tokens[start + offset].label).join(" "),
    });
  }

  for (const [start, token] of tokens.entries()) {
    if (covered.has(start) || token.key.length < 2 || STOP_WORDS.has(token.key)) continue;
    if (requirements.some((item) => item.keys.length === 1 && item.keys[0] === token.key)) continue;
    requirements.push({ start, keys: [token.key], label: token.label });
  }

  return requirements.sort((a, b) => a.start - b.start);
}

function isMatched(requirement, cvTokens) {
  return requirement.keys.length === 1
    ? cvTokens.some((token) => sameWord(token.key, requirement.keys[0]))
    : findPhrase(cvTokens, requirement.keys) >= 0;
}

function levelFor(score) {
  if (score >= 85) return "ممتاز";
  if (score >= 65) return "جيد";
  if (score >= 40) return "متوسط";
  return "منخفض";
}

function recommendationFor(score) {
  if (score === 100) return "توافق ممتاز؛ راجع الصياغة النهائية قبل التقديم.";
  if (score >= 85) return "توافق ممتاز؛ أكمل الأولويات المفقودة التي تعكس خبرتك فعلًا.";
  if (score >= 65) return "توافق جيد؛ أضف الأولويات المفقودة التي تعكس خبرتك فعلًا.";
  if (score >= 40) return "توافق متوسط؛ أبرز الخبرات المرتبطة بالمتطلبات المفقودة.";
  return "التوافق منخفض؛ خصّص السيرة للمهارات المطلوبة دون مبالغة.";
}

/**
 * Compares CV text with a job description without network, storage, or logging.
 * Returned requirement labels originate only from the job description.
 */
export function analyzeCv(cvText, jobText) {
  requireText(cvText, "cvText", "CV_TEXT_REQUIRED", "يجب إدخال نص السيرة الذاتية.");
  requireText(jobText, "jobText", "JOB_TEXT_REQUIRED", "يجب إدخال نص الوصف الوظيفي.");

  const cvTokens = tokenize(cvText);
  const requirements = jobRequirements(jobText);
  const matchedTerms = requirements.filter((item) => isMatched(item, cvTokens)).map((item) => item.label);
  const missingTerms = requirements.filter((item) => !isMatched(item, cvTokens)).map((item) => item.label);
  const score = requirements.length === 0
    ? 0
    : Math.round((matchedTerms.length / requirements.length) * 100);
  const level = levelFor(score);

  return {
    score,
    matchedTerms,
    missingTerms,
    recommendation: recommendationFor(score),
    level,
    summary: `مستوى التوافق ${level} بدرجة ${score} من 100.`,
    topSuggestions: missingTerms.slice(0, 3),
  };
}
