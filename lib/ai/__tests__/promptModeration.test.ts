import { SUGGESTIONS } from '../../../components/aiGenerator/constants';
import { moderatePrompt } from '../promptModeration';

describe('moderatePrompt — allows legitimate kawaii prompts', () => {
  it('passes every built-in Quick Start suggestion', () => {
    for (const s of SUGGESTIONS) {
      expect(moderatePrompt(s).allowed).toBe(true);
    }
  });

  it('passes typical cute prompts', () => {
    const ok = [
      'kawaii baby panda eating bamboo, pastel forest',
      'chibi toddler in a raincoat jumping in puddles',
      'cute baby astronaut with a tiny rocket, soft stars',
      'adorable baby fox in autumn leaves, warm light',
      'kawaii apple and cherry characters having a picnic',
      'cute ghost and pumpkin, soft halloween pastels',
      'baby penguin in a fluffy scarf on the snow',
      'kawaii killer whale plushie under the sea',
      'baby in a cozy diaper onesie holding a balloon',
    ];
    for (const p of ok) {
      expect(moderatePrompt(p).allowed).toBe(true);
    }
  });

  it('treats an empty / whitespace prompt as allowed (caller handles empties)', () => {
    expect(moderatePrompt('').allowed).toBe(true);
    expect(moderatePrompt('   ').allowed).toBe(true);
  });
});

describe('moderatePrompt — word-boundary, no false positives', () => {
  it('does not block benign words that merely contain a banned substring', () => {
    // "war" is banned, but these must NOT match.
    expect(moderatePrompt('warm cozy baby by the fireplace').allowed).toBe(true);
    expect(moderatePrompt('award winning cute toddler forward facing').allowed).toBe(true);
    // "kill" is banned, "killer whale" / "skillful" must not match.
    expect(moderatePrompt('skillful baby artist painting').allowed).toBe(true);
    // "bomb" is intentionally not banned (bath bomb is a cute object).
    expect(moderatePrompt('kawaii bath bomb with sparkles').allowed).toBe(true);
    // "apple" (fruit) allowed; only "apple logo" is IP.
    expect(moderatePrompt('cute red apple character smiling').allowed).toBe(true);
  });

  it('allows kawaii words that double as celebrity surnames', () => {
    // We block "elon musk"/"taylor swift"/"drake the rapper" by FULL name,
    // never these bare tokens which are common kawaii subjects.
    const ok = [
      'cute drake duckling swimming in a pond', // drake = male duck
      'kawaii musk deer in a snowy forest', // musk = deer
      'a swift bird flying over pastel hills', // swift = bird
      'kawaii princess bunny in a castle', // royalty allowed
      'king penguin chick on the ice', // king allowed
      'baby with messy hair, sleepy expression', // messy != messi
      'cute baby on a cruise ship at sunset', // cruise allowed
    ];
    for (const p of ok) {
      expect(moderatePrompt(p).allowed).toBe(true);
    }
  });
});

describe('moderatePrompt — blocks prohibited content by category', () => {
  const cases: Array<{ prompt: string; category: string }> = [
    { prompt: 'baby spider-man swinging through the city', category: 'intellectual_property' },
    { prompt: 'kawaii Hello Kitty in a garden', category: 'intellectual_property' },
    { prompt: 'cute Pikachu in pastel clouds', category: 'intellectual_property' },
    { prompt: 'a wallpaper with the Nike logo', category: 'intellectual_property' },
    { prompt: 'recreation of the Mona Lisa', category: 'intellectual_property' },
    { prompt: 'graphic gore and blood everywhere', category: 'violence' },
    { prompt: 'character holding a gun in combat', category: 'violence' },
    { prompt: 'nazi swastika banner', category: 'hate' },
    { prompt: 'instructions with dynamite and a pipe bomb', category: 'illegal' },
    { prompt: 'a deepfake of Taylor Swift', category: 'real_person' },
    { prompt: 'trump giving a speech at a rally', category: 'real_person' },
    { prompt: 'the president giving a speech', category: 'real_person' },
    { prompt: 'a famous rapper on stage', category: 'real_person' },
    { prompt: 'elon musk on mars', category: 'real_person' },
    { prompt: 'a wallpaper in ghibli style', category: 'intellectual_property' },
    { prompt: 'cute baby in disney style', category: 'intellectual_property' },
    { prompt: 'kawaii pusheen the cat', category: 'intellectual_property' },
    { prompt: 'political propaganda poster with flag burning', category: 'political' },
    { prompt: 'fake news headline conspiracy theory art', category: 'misinformation' },
    { prompt: 'grotesque satanic pentagram horror scene', category: 'horror' },
    { prompt: 'a nude adult figure', category: 'sexual' },
  ];

  for (const { prompt, category } of cases) {
    it(`blocks "${prompt}" as ${category}`, () => {
      const v = moderatePrompt(prompt);
      expect(v.allowed).toBe(false);
      expect(v.category).toBe(category);
    });
  }

  it('is case- and punctuation-insensitive', () => {
    expect(moderatePrompt('SPIDER-MAN!!!').category).toBe('intellectual_property');
    expect(moderatePrompt('B.L.O.O.D').allowed).toBe(true); // dots split into letters — not a match (expected gap)
  });
});

describe('moderatePrompt — child safety escalation', () => {
  it('escalates a minor term + a sexual term to child_safety', () => {
    const v = moderatePrompt('sexy baby pose');
    expect(v.allowed).toBe(false);
    expect(v.category).toBe('child_safety');
  });

  it('blocks a baby in swimwear/underwear as child_safety', () => {
    expect(moderatePrompt('baby in a bikini').category).toBe('child_safety');
    expect(moderatePrompt('toddler in underwear').category).toBe('child_safety');
  });

  it('blocks explicit CSAM terms outright', () => {
    expect(moderatePrompt('loli art').category).toBe('child_safety');
  });

  it('treats adult sexual content (no minor) as sexual, not child_safety', () => {
    // No minor word present.
    expect(moderatePrompt('an erotic figure').category).toBe('sexual');
  });
});
