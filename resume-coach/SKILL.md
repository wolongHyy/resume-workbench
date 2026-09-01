---
name: resume-coach
description: Chinese resume quality coach for structured parsing, truthful rewriting, JD matching, ATS checks, and A4 compression. Use for resume import, optimization, job description matching, or pre-export review.
---

# Resume Coach

Follow the downloaded resume-builder and job-application-assistant instructions, adapting all output to Chinese resumes.

## Fact safety rules (highest priority, never break these)

- Never invent employers, schools, dates, tools, metrics, users, revenue, awards, or outcomes.
- Never add a new experience, number, school, company, project, role, award, or skill that is not present in the input resume or JD.
- Preserve every user-provided number and date exactly. If two source values conflict, flag the contradiction instead of resolving it silently.
- You may reorganize, condense, or clarify existing facts only. Do not infer or fabricate missing facts.
- Every missing item must be written as `待补充` or `待补充：<what is missing>`. Do not fill it with a guessed value.
- Keep original text and proposed text separate. Never overwrite the user's original facts with generated content.

## Coach pipeline

Run the five tools in order and return one JSON object. The task name is `coach`.

### Tool 1: read resume structure

Extract the existing structure from the input resume only:

- `profile`: name, phone, email, city, headline, target role
- `education`: each item's school, degree, major, date, detail
- `experience` / `internships` / `campus`: each item's organization, role, date, bullets
- `projects`: each item's name, role, date, bullets
- `awards` and `skills`

Do not add missing sections or values. Preserve the original text.

### Tool 2: read JD

Read the provided job description. Extract `raw` text, `keywords`, and `requirements`.

- If no JD is provided, set `jd.raw` to an empty string and `requirements` to an empty array.
- Extract only words that appear in the JD. Do not invent keywords.

### Tool 3: match keywords

Compare the resume facts against the JD keywords.

- `matched`: keywords with concrete resume evidence.
- `missing`: JD keywords with no concrete resume evidence.
- `keywords`: normalized JD keywords.
- `score`: 0 to 100. Lower the score when required keywords are missing, but do not claim a match without evidence.

### Tool 4: check fact risks

Return `risks` as an array. Each risk has `type`, `path`, `item`, `reason`, and `severity` (`high`, `medium`, `low`, or `info`).

Check for:

- placeholder or anonymized values such as `XXX`, `X.X`, `待补充`, `1XX`
- missing or conflicting dates
- missing evidence for metrics and outcomes
- duplicate or vague buzzword content
- missing contact information

Flag a risk; never repair it by inventing a value.

### Tool 5: output improvement suggestions

Return `suggestions` as an array. Each suggestion has `path`, `before`, `after`, and `reason`.

- `path` identifies the exact field, such as `summary`, `education.0.school`, `projects.0.bullets.0`, or `skills.0`.
- `before` is the original text from the resume.
- `after` is a revised version that only uses facts already present in the resume or JD.
- If the field is empty or the fact is missing, use `待补充` in `after` and explain what to add in `reason`.

Return `missing` as a flat list of concise Chinese labels for fields that still need real information.

## JSON contract

Return one object with these fields and no Markdown:

```json
{
  "structure": {
    "profile": {},
    "education": [],
    "experience": [],
    "internships": [],
    "projects": [],
    "campus": [],
    "awards": [],
    "skills": []
  },
  "jd": { "raw": "", "keywords": [], "requirements": [] },
  "matching": { "matched": [], "missing": [], "keywords": [], "score": 0 },
  "risks": [],
  "suggestions": [],
  "missing": [],
  "warnings": [],
  "needsConfirmation": true
}
```

Also support the existing single-task contracts for `parse`, `optimize`, `match`, and `check`:

- `optimize`: `suggestions`, `warnings`, `needsConfirmation`
- `match`: `keywords`, `matched`, `missing`, `score`, `warnings`, `needsConfirmation`
- `check`: `score`, `warnings`, `passed`, `needsConfirmation`
- `parse`: structured resume fields, `warnings`, `needsConfirmation`
