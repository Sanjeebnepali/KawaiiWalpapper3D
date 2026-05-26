import { MODERATION_CATEGORIES } from '../promptModeration';
import { parseClassifierVerdict } from '../promptClassifier';

const cats = MODERATION_CATEGORIES;

describe('parseClassifierVerdict', () => {
  it('parses a clean allowed verdict', () => {
    const v = parseClassifierVerdict('{"allowed":true,"category":"none"}', cats);
    expect(v.allowed).toBe(true);
  });

  it('parses a blocked verdict with a known category + reason', () => {
    const v = parseClassifierVerdict(
      '{"allowed":false,"category":"real_person","reason":"depicts a real politician"}',
      cats,
    );
    expect(v.allowed).toBe(false);
    expect(v.category).toBe('real_person');
    expect(v.reason).toBe('depicts a real politician');
  });

  it('tolerates markdown fences / surrounding prose', () => {
    const v = parseClassifierVerdict(
      'Sure!\n```json\n{"allowed":false,"category":"intellectual_property"}\n```',
      cats,
    );
    expect(v.allowed).toBe(false);
    expect(v.category).toBe('intellectual_property');
  });

  it('fails OPEN when there is no JSON', () => {
    const v = parseClassifierVerdict('I cannot help with that.', cats);
    expect(v.allowed).toBe(true);
    expect(v.skipped).toBe(true);
  });

  it('fails OPEN on malformed JSON', () => {
    const v = parseClassifierVerdict('{"allowed":false, category:', cats);
    expect(v.allowed).toBe(true);
    expect(v.skipped).toBe(true);
  });

  it('fails OPEN when allowed is not a boolean', () => {
    const v = parseClassifierVerdict('{"allowed":"false","category":"sexual"}', cats);
    expect(v.allowed).toBe(true);
    expect(v.skipped).toBe(true);
  });

  it('fails OPEN when blocked but the category is unknown/none', () => {
    expect(parseClassifierVerdict('{"allowed":false,"category":"none"}', cats).allowed).toBe(true);
    expect(parseClassifierVerdict('{"allowed":false,"category":"spam"}', cats).allowed).toBe(true);
  });

  it('caps an overlong reason at 200 chars', () => {
    const long = 'x'.repeat(500);
    const v = parseClassifierVerdict(
      `{"allowed":false,"category":"violence","reason":"${long}"}`,
      cats,
    );
    expect(v.allowed).toBe(false);
    expect(v.reason?.length).toBe(200);
  });
});
