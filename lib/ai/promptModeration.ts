/**
 * AI prompt moderator — the client-side content gate.
 *
 * `moderatePrompt(text)` screens a user's generation prompt against the
 * prohibited-content tables in `moderationTerms.ts` and returns a verdict.
 * The AI Generator calls this BEFORE hitting any provider, so a disallowed
 * prompt never spends a generation, never reaches the network, and never
 * counts against the daily quota.
 *
 * WHY KEYWORDS (and the honest limits): generation is client -> provider,
 * so the only thing we can inspect locally is the prompt text. This catches
 * the explicit cases the product must refuse (named IP, gore, sexual,
 * child-safety, hate, etc.). It cannot understand paraphrase or obfuscation
 * (leetspeak) — the provider's own safety filter (ImageGenError reason
 * `safety_filter`) is the second line of defence.
 *
 * Matching is word-boundary via space-padding — see the contract in
 * `moderationTerms.ts`. Rules run in SEVERITY ORDER and the first hit wins,
 * so a prompt is labelled by its most serious problem.
 */

import {
  CHILD_SAFETY_TERMS,
  HATE_TERMS,
  HORROR_TERMS,
  ILLEGAL_TERMS,
  IP_TERMS,
  MINOR_TERMS,
  MISINFO_TERMS,
  POLITICAL_TERMS,
  REAL_PERSON_TERMS,
  SEXUAL_TERMS,
  VIOLENCE_TERMS,
} from './moderationTerms';

/** The bucket a blocked prompt falls into. Drives the alert's copy + icon. */
export type ModerationCategory =
  | 'child_safety'
  | 'sexual'
  | 'violence'
  | 'hate'
  | 'illegal'
  | 'real_person'
  | 'political'
  | 'misinformation'
  | 'horror'
  | 'intellectual_property';

/** Runtime list of every category — used by the remote classifier to
 *  validate the category string a model returns. Keep in sync with the
 *  `ModerationCategory` union above. */
export const MODERATION_CATEGORIES: readonly ModerationCategory[] = [
  'child_safety',
  'sexual',
  'violence',
  'hate',
  'illegal',
  'real_person',
  'political',
  'misinformation',
  'horror',
  'intellectual_property',
];

export interface ModerationVerdict {
  /** True => safe to send to the provider. */
  allowed: boolean;
  /** Present only when `allowed` is false. */
  category?: ModerationCategory;
  /**
   * The term (or `minor+sexual` pair) that tripped the rule. For DEV
   * logging and tests ONLY — never surface this to the user (it would just
   * teach them which word to swap).
   */
  matchedTerm?: string;
}

const ALLOWED: ModerationVerdict = { allowed: true };

/**
 * Fold a raw prompt into the canonical form the term tables are written in:
 * lowercase, accent-stripped, every run of non-alphanumerics collapsed to a
 * single space, and padded with a leading + trailing space. The padding is
 * what makes `' <term> '` a word-boundary test.
 */
function normalize(prompt: string): string {
  const folded = prompt
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ` ${folded} `;
}

/** First term from `terms` that appears as a whole word in `text`, if any. */
function findTerm(text: string, terms: readonly string[]): string | undefined {
  return terms.find((term) => text.includes(` ${term} `));
}

function block(category: ModerationCategory, matchedTerm: string): ModerationVerdict {
  return { allowed: false, category, matchedTerm };
}

/**
 * Screen a prompt. Returns `{ allowed: true }` for safe prompts, or a
 * blocked verdict tagged with the most serious matching category.
 *
 * An empty / whitespace-only prompt is treated as allowed here — the caller
 * already rejects empties with its own "type a prompt first" message, so
 * there's nothing to moderate.
 */
export function moderatePrompt(prompt: string): ModerationVerdict {
  const text = normalize(prompt);
  if (text.trim().length === 0) return ALLOWED;

  // 1. Child safety — explicit CSAM terms. Highest severity, checked first.
  const csae = findTerm(text, CHILD_SAFETY_TERMS);
  if (csae) return block('child_safety', csae);

  // 2. Child safety by co-occurrence: a minor term + a sexual term. In a
  //    baby-character app "baby" is almost always present, so any sexual
  //    term here is, correctly, child sexualisation.
  const sexual = findTerm(text, SEXUAL_TERMS);
  const minor = findTerm(text, MINOR_TERMS);
  if (sexual && minor) return block('child_safety', `${minor}+${sexual}`);

  // 3. Sexual / adult content with no minor term present.
  if (sexual) return block('sexual', sexual);

  // 4. Violence, gore, weapons, self-harm, substances, cruelty.
  const violence = findTerm(text, VIOLENCE_TERMS);
  if (violence) return block('violence', violence);

  // 5. Hate / extremist symbols.
  const hate = findTerm(text, HATE_TERMS);
  if (hate) return block('hate', hate);

  // 6. Illegal activity / dangerous instructions.
  const illegal = findTerm(text, ILLEGAL_TERMS);
  if (illegal) return block('illegal', illegal);

  // 7. Real people / deepfakes / named public figures.
  const realPerson = findTerm(text, REAL_PERSON_TERMS);
  if (realPerson) return block('real_person', realPerson);

  // 8. Political propaganda / civic incitement.
  const political = findTerm(text, POLITICAL_TERMS);
  if (political) return block('political', political);

  // 9. Misinformation / impersonation.
  const misinfo = findTerm(text, MISINFO_TERMS);
  if (misinfo) return block('misinformation', misinfo);

  // 10. Horror / occult / grotesque (not child-friendly).
  const horror = findTerm(text, HORROR_TERMS);
  if (horror) return block('horror', horror);

  // 11. Trademarked / copyrighted characters, brands, famous artwork.
  const ip = findTerm(text, IP_TERMS);
  if (ip) return block('intellectual_property', ip);

  return ALLOWED;
}
