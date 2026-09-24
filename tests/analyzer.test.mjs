import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const analyzerSource = await readFile(new URL("../analyzer.js", import.meta.url), "utf8");
const analyzerModuleUrl = `data:text/javascript;base64,${Buffer.from(analyzerSource).toString("base64")}`;
const { AnalyzerInputError, analyzeCv } = await import(analyzerModuleUrl);

describe("analyzeCv", () => {
  it("returns a deterministic score and matched/missing meaningful terms", () => {
    const result = analyzeCv(
      "لدي خبرة في JavaScript وإدارة المشاريع وتحليل البيانات.",
      "نبحث عن خبرة في JavaScript وتحليل البيانات وإدارة المشاريع والتواصل.",
    );

    assert.deepEqual(result, {
      score: 83,
      matchedTerms: ["javascript", "وتحليل", "البيانات", "وإدارة", "المشاريع"],
      missingTerms: ["والتواصل"],
      recommendation: "توافق جيد؛ أضف الكلمات المفقودة التي تعكس خبرتك فعلًا.",
    });
  });

  it("counts repeated job terms once", () => {
    const result = analyzeCv("Python SQL", "Python Python SQL تحليل");

    assert.equal(result.score, 67);
    assert.deepEqual(result.matchedTerms, ["python", "sql"]);
    assert.deepEqual(result.missingTerms, ["تحليل"]);
  });

  it("keeps scores within 0 and 100 at both boundaries", () => {
    assert.equal(analyzeCv("Python SQL", "Python SQL").score, 100);
    assert.equal(analyzeCv("تصميم", "Python SQL").score, 0);
  });

  it("rejects a missing CV with a structured, non-reflective Arabic error", () => {
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
  });

  it("rejects a missing or non-string job description", () => {
    for (const invalidJobText of ["", "  ", null, undefined, 42]) {
      assert.throws(
        () => analyzeCv("Python", invalidJobText),
        (error) => {
          assert.equal(error.field, "jobText");
          assert.equal(error.code, "JOB_TEXT_REQUIRED");
          assert.equal(error.message, "يجب إدخال نص الوصف الوظيفي.");
          return true;
        },
      );
    }
  });

  it("does not expose contact details as analysis terms", () => {
    const result = analyzeCv(
      "Python والتواصل",
      "Python والتواصل recruiter@example.com https://example.com 0551234567",
    );

    assert.equal(result.score, 100);
    assert.deepEqual(result.matchedTerms, ["python", "والتواصل"]);
    assert.deepEqual(result.missingTerms, []);
    assert.ok(!JSON.stringify(result).includes("example.com"));
    assert.ok(!JSON.stringify(result).includes("0551234567"));
  });
});
