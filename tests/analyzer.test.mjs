import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const analyzerSource = await readFile(new URL("../analyzer.js", import.meta.url), "utf8");
const analyzerModuleUrl = `data:text/javascript;base64,${Buffer.from(analyzerSource).toString("base64")}`;
const { AnalyzerInputError, analyzeCv } = await import(analyzerModuleUrl);

const EXAMPLE_CV = "محللة أعمال بخبرة في تحليل المتطلبات وتوثيق إجراءات العمل. قدت مشاريع تحول رقمي وتعاونت مع أصحاب المصلحة والفرق التقنية، وأعددت تقارير ولوحات معلومات باستخدام Excel وPower BI. أجيد إدارة المشاريع، تحليل البيانات، والتواصل باللغتين العربية والإنجليزية.";
const EXAMPLE_JOB = "نبحث عن محلل أعمال يجيد تحليل المتطلبات، تحليل البيانات، وإدارة المشاريع. تشمل المسؤوليات التواصل مع أصحاب المصلحة، توثيق إجراءات العمل، إعداد التقارير ولوحات المعلومات باستخدام Power BI، والمشاركة في مبادرات التحول الرقمي. إجادة اللغة الإنجليزية مهارة مطلوبة، وتعد معرفة SQL وإدارة المخاطر ميزة إضافية.";

describe("analyzeCv", () => {
  it("returns the exact, credible result for the public example", () => {
    assert.deepEqual(analyzeCv(EXAMPLE_CV, EXAMPLE_JOB), {
      score: 85,
      matchedTerms: [
        "تحليل المتطلبات", "تحليل البيانات", "وإدارة المشاريع", "التواصل",
        "أصحاب المصلحة", "توثيق إجراءات العمل", "إعداد التقارير", "ولوحات المعلومات",
        "Power BI", "التحول الرقمي", "الإنجليزية",
      ],
      missingTerms: ["SQL", "وإدارة المخاطر"],
      recommendation: "توافق ممتاز؛ أكمل الأولويات المفقودة التي تعكس خبرتك فعلًا.",
      level: "ممتاز",
      summary: "مستوى التوافق ممتاز بدرجة 85 من 100.",
      topSuggestions: ["SQL", "وإدارة المخاطر"],
    });
  });

  it("normalizes Arabic letter forms, diacritics, conjunctions, and definite articles", () => {
    const result = analyzeCv(
      "أجيد ادارهُ المشاريع وتحليل بيانات",
      "المطلوب: وإدارة المشاريع، والتحليل والبيانات",
    );

    assert.equal(result.score, 100);
    assert.deepEqual(result.matchedTerms, ["وإدارة المشاريع", "والتحليل والبيانات"]);
  });

  it("matches useful multi-word skills as one requirement", () => {
    const result = analyzeCv(
      "خبرة في تحليل البيانات وإعداد التقارير باستخدام Power BI",
      "تحليل البيانات، إعداد التقارير، Power BI، SQL",
    );

    assert.equal(result.score, 75);
    assert.deepEqual(result.matchedTerms, ["تحليل البيانات", "إعداد التقارير", "Power BI"]);
    assert.deepEqual(result.missingTerms, ["SQL"]);
    assert.deepEqual(result.topSuggestions, ["SQL"]);
  });

  it("keeps score and level boundaries deterministic", () => {
    const perfect = analyzeCv("Python SQL", "Python SQL");
    const none = analyzeCv("تصميم", "Python SQL");

    assert.equal(perfect.score, 100);
    assert.equal(perfect.level, "ممتاز");
    assert.equal(none.score, 0);
    assert.equal(none.level, "منخفض");
  });

  it("uses one qualitative band consistently at a rounded score of 67", () => {
    const result = analyzeCv("Python SQL", "Python SQL Design");

    assert.equal(result.score, 67);
    assert.equal(result.level, "جيد");
    assert.equal(result.summary, "مستوى التوافق جيد بدرجة 67 من 100.");
    assert.equal(result.recommendation, "توافق جيد؛ أضف الأولويات المفقودة التي تعكس خبرتك فعلًا.");
  });

  it("deduplicates every occurrence of recognized Arabic and Power BI phrases", () => {
    const result = analyzeCv(
      "تحليل البيانات Power BI",
      "تحليل البيانات وتحليل البيانات وPower BI وPower BI",
    );

    assert.equal(result.score, 100);
    assert.deepEqual(result.matchedTerms, ["تحليل البيانات", "وPower BI"]);
    assert.deepEqual(result.missingTerms, []);
    assert.deepEqual(result.topSuggestions, []);
  });

  it("rejects invalid inputs with structured, non-reflective Arabic errors", () => {
    assert.throws(
      () => analyzeCv("   ", "Python"),
      (error) => {
        assert.ok(error instanceof TypeError);
        assert.ok(error instanceof AnalyzerInputError);
        assert.equal(error.field, "cvText");
        assert.equal(error.code, "CV_TEXT_REQUIRED");
        assert.equal(error.message, "يجب إدخال نص السيرة الذاتية.");
        return true;
      },
    );

    for (const invalidJobText of ["", "  ", null, undefined, 42]) {
      assert.throws(() => analyzeCv("Python", invalidJobText), (error) => {
        assert.equal(error.field, "jobText");
        assert.equal(error.code, "JOB_TEXT_REQUIRED");
        assert.equal(error.message, "يجب إدخال نص الوصف الوظيفي.");
        return true;
      });
    }
  });

  it("never returns CV-only text or contact details", () => {
    const privateCvText = "Python سري-للغاية secret@example.com 0551234567";
    const result = analyzeCv(
      privateCvText,
      "Python SQL recruiter@example.com https://example.com 0500000000",
    );
    const output = JSON.stringify(result);

    assert.equal(result.score, 50);
    assert.deepEqual(result.matchedTerms, ["Python"]);
    assert.deepEqual(result.missingTerms, ["SQL"]);
    for (const privateValue of ["سري", "secret@example.com", "0551234567", "recruiter@example.com", "example.com", "0500000000"]) {
      assert.ok(!output.includes(privateValue));
    }
  });
});
