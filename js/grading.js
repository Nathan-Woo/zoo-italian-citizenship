/** Normalizes text for comparison: lowercase, strip accents, collapse whitespace,
 * strip most punctuation, and drop leading articles so "il gatto" ~= "gatto". */
export function normalize(str) {
  if (!str) return "";
  let s = str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"()\-]/g, "")
    .replace(/\s+/g, " ");
  return s;
}

/** Removes a single leading article/pronoun token, used as a lenient second pass. */
function stripLeadingArticle(s) {
  const articles = [
    "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
    "the", "a", "an", "to",
  ];
  const parts = s.split(" ");
  if (parts.length > 1 && articles.includes(parts[0])) {
    return parts.slice(1).join(" ");
  }
  return s;
}

/** Returns true if the student's answer matches the correct answer closely enough
 * to auto-grade as correct. Accepts alternate answers separated by "/" or ";" in
 * the content's translation field. */
export function isAnswerCorrect(studentAnswer, correctAnswer) {
  const given = normalize(studentAnswer);
  if (!given) return false;
  const candidates = String(correctAnswer)
    .split(/[/;]/)
    .map((c) => normalize(c));
  for (const c of candidates) {
    if (!c) continue;
    if (given === c) return true;
    if (stripLeadingArticle(given) === stripLeadingArticle(c)) return true;
  }
  return false;
}
