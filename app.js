import { analyzeCv } from "./analyzer.js";

const form = document.querySelector("#assessment-form");
const cvInput = document.querySelector("#cv-text");
const jobInput = document.querySelector("#job-text");
const loadExampleButton = document.querySelector("#load-example");
const errorMessage = document.querySelector("#form-error");
const results = document.querySelector("#results");
const scoreRing = document.querySelector("#score-ring");
const scoreValue = document.querySelector("#score-value");
const recommendation = document.querySelector("#recommendation");
const matchedTerms = document.querySelector("#matched-terms");
const missingTerms = document.querySelector("#missing-terms");
const matchedCount = document.querySelector("#matched-count");
const missingCount = document.querySelector("#missing-count");

const EXAMPLE = {
  cv: `محللة أعمال بخبرة في تحليل المتطلبات وتوثيق إجراءات العمل. قدت مشاريع تحول رقمي وتعاونت مع أصحاب المصلحة والفرق التقنية، وأعددت تقارير ولوحات معلومات باستخدام Excel وPower BI. أجيد إدارة المشاريع، تحليل البيانات، والتواصل باللغتين العربية والإنجليزية.`,
  job: `نبحث عن محلل أعمال يجيد تحليل المتطلبات، تحليل البيانات، وإدارة المشاريع. تشمل المسؤوليات التواصل مع أصحاب المصلحة، توثيق إجراءات العمل، إعداد التقارير ولوحات المعلومات باستخدام Power BI، والمشاركة في مبادرات التحول الرقمي. إجادة اللغة الإنجليزية مهارة مطلوبة، وتعد معرفة SQL وإدارة المخاطر ميزة إضافية.`,
};

function clearError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
  cvInput.removeAttribute("aria-invalid");
  jobInput.removeAttribute("aria-invalid");
}

function showError(message, invalidFields = []) {
  results.hidden = true;
  errorMessage.textContent = message;
  errorMessage.hidden = false;

  for (const field of invalidFields) {
    field.setAttribute("aria-invalid", "true");
  }

  errorMessage.focus();
}

function renderTerms(container, terms, emptyMessage) {
  container.replaceChildren();

  if (terms.length === 0) {
    const item = document.createElement("li");
    item.className = "empty-term";
    item.textContent = emptyMessage;
    container.append(item);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const term of terms) {
    const item = document.createElement("li");
    item.textContent = term;
    fragment.append(item);
  }
  container.append(fragment);
}

function renderResult(analysis) {
  const score = Math.max(0, Math.min(100, Number(analysis.score) || 0));
  const matched = Array.isArray(analysis.matchedTerms) ? analysis.matchedTerms : [];
  const missing = Array.isArray(analysis.missingTerms) ? analysis.missingTerms : [];

  scoreValue.textContent = String(score);
  scoreRing.style.setProperty("--score", `${score}%`);
  scoreRing.setAttribute("aria-valuenow", String(score));
  recommendation.textContent = analysis.recommendation || "راجع الكلمات المفقودة ذات الصلة بخبرتك.";
  matchedCount.textContent = String(matched.length);
  missingCount.textContent = String(missing.length);
  matchedCount.setAttribute("aria-label", `عدد الكلمات المتطابقة: ${matched.length}`);
  missingCount.setAttribute("aria-label", `عدد الكلمات المفقودة: ${missing.length}`);
  renderTerms(matchedTerms, matched, "لم تظهر كلمات متطابقة بعد.");
  renderTerms(missingTerms, missing, "لا توجد كلمات مفقودة — تطابق ممتاز.");

  results.hidden = false;
  results.focus({ preventScroll: true });
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function validateInputs() {
  const invalidFields = [];
  if (!cvInput.value.trim()) invalidFields.push(cvInput);
  if (!jobInput.value.trim()) invalidFields.push(jobInput);

  if (invalidFields.length === 0) return true;

  let message = "يرجى إدخال نص السيرة الذاتية والوصف الوظيفي قبل التحليل.";
  if (invalidFields.length === 1) {
    message = invalidFields[0] === cvInput
      ? "يرجى إدخال نص السيرة الذاتية قبل التحليل."
      : "يرجى إدخال نص الوصف الوظيفي قبل التحليل.";
  }

  showError(message, invalidFields);
  invalidFields[0].focus();
  return false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearError();

  if (!validateInputs()) return;

  try {
    const analysis = analyzeCv(cvInput.value, jobInput.value);
    renderResult(analysis);
  } catch (error) {
    const message = error instanceof TypeError
      ? error.message
      : "تعذر إكمال التحليل. يرجى المحاولة مرة أخرى.";
    showError(message);
  }
});

loadExampleButton.addEventListener("click", () => {
  cvInput.value = EXAMPLE.cv;
  jobInput.value = EXAMPLE.job;
  clearError();
  results.hidden = true;
  cvInput.focus();
});

for (const field of [cvInput, jobInput]) {
  field.addEventListener("input", () => {
    results.hidden = true;
    field.removeAttribute("aria-invalid");
    if (cvInput.value.trim() && jobInput.value.trim()) clearError();
  });
}

if (new URLSearchParams(window.location.search).get("demo") === "1") {
  cvInput.value = EXAMPLE.cv;
  jobInput.value = EXAMPLE.job;
  renderResult(analyzeCv(EXAMPLE.cv, EXAMPLE.job));
}
