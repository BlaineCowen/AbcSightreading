/**
 * A guess, from a Google account's name and address alone, at whether it is a
 * student's. It only picks which answer the "student or teacher?" question
 * offers first (WelcomeNote): an address cannot say who someone is, since a
 * district often gives staff and students the same domain (S&S CISD, 12
 * November 2026). The signs: a student domain (students.katyisd.org,
 * stu.district.org), an address that is mostly a number (k1632767, an ID),
 * or a name in capitals, as a school's records system writes them.
 */
export function looksLikeStudent(name: string, email: string): boolean {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if (/(^|\.)(students?|stu|learners?|pupils?)\./.test(domain + ".")) return true;
  const digits = (local.match(/\d/g) ?? []).length;
  if (digits >= 4 && digits >= local.length / 2) return true;
  const letters = name.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}
