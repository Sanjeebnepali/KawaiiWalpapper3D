import {
  CATALOG_TO_MOOD,
  emotionToMood,
  getMoodOrDefault,
  MANUAL_MOOD_IDS,
  MOOD_BY_ID,
  MOODS,
  NOTIFICATION_MOOD_IDS,
  type DetectableEmotion,
  type MoodId,
} from '../moods';

describe('emotionToMood', () => {
  // Every DetectableEmotion → its mapped MoodId, per the switch in moods.ts.
  // `disgusted` folds into angry; `fearful` falls back to neutral.
  it.each<[DetectableEmotion, MoodId]>([
    ['happy', 'happy'],
    ['sad', 'sad'],
    ['angry', 'angry'],
    ['disgusted', 'angry'],
    ['surprised', 'surprised'],
    ['fearful', 'neutral'],
    ['neutral', 'neutral'],
  ])('%s → %s', (emotion, mood) => {
    expect(emotionToMood(emotion)).toBe(mood);
  });

  it('falls back to neutral for an unrecognised emotion (default branch)', () => {
    // The switch has a `default: return 'neutral'`. Force an off-contract value.
    expect(emotionToMood('confused' as unknown as DetectableEmotion)).toBe('neutral');
  });

  it('only ever returns a valid MoodId', () => {
    const validIds = MOODS.map((m) => m.id);
    const emotions: DetectableEmotion[] = [
      'happy',
      'sad',
      'angry',
      'surprised',
      'neutral',
      'fearful',
      'disgusted',
    ];
    for (const e of emotions) {
      expect(validIds).toContain(emotionToMood(e));
    }
  });
});

describe('getMoodOrDefault', () => {
  it('returns the matching MoodDef for a valid id', () => {
    expect(getMoodOrDefault('sad')).toBe(MOOD_BY_ID.sad);
    expect(getMoodOrDefault('calm')).toBe(MOOD_BY_ID.calm);
  });

  it('resolves every canonical MoodId to its own def', () => {
    for (const m of MOODS) {
      expect(getMoodOrDefault(m.id)).toBe(MOOD_BY_ID[m.id]);
    }
  });

  it('defaults to happy for null / undefined / empty string', () => {
    expect(getMoodOrDefault(null)).toBe(MOOD_BY_ID.happy);
    expect(getMoodOrDefault(undefined)).toBe(MOOD_BY_ID.happy);
    expect(getMoodOrDefault('')).toBe(MOOD_BY_ID.happy);
  });

  it('defaults to happy for an unknown id', () => {
    expect(getMoodOrDefault('not-a-mood')).toBe(MOOD_BY_ID.happy);
  });
});

describe('MOOD_BY_ID', () => {
  it('indexes every mood in MOODS by its id', () => {
    expect(Object.keys(MOOD_BY_ID).sort()).toEqual(MOODS.map((m) => m.id).sort());
    for (const m of MOODS) {
      expect(MOOD_BY_ID[m.id]).toBe(m);
    }
  });
});

describe('MOODS catalog', () => {
  it('has the 7 canonical moods in spec order', () => {
    expect(MOODS.map((m) => m.id)).toEqual([
      'happy',
      'sad',
      'angry',
      'calm',
      'excited',
      'surprised',
      'neutral',
    ]);
  });

  it('every mood has the required string fields and a 2-stop gradient', () => {
    for (const m of MOODS) {
      expect(typeof m.label).toBe('string');
      expect(m.label.length).toBeGreaterThan(0);
      expect(typeof m.emoji).toBe('string');
      expect(m.emoji.length).toBeGreaterThan(0);
      expect(typeof m.seed).toBe('string');
      expect(m.gradient).toHaveLength(2);
    }
  });

  it('ids are unique', () => {
    const ids = MOODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('MANUAL_MOOD_IDS', () => {
  it('is the 5 core emotional axes in declared order', () => {
    expect(MANUAL_MOOD_IDS).toEqual(['happy', 'sad', 'angry', 'calm', 'excited']);
  });

  it('every id resolves to a real mood', () => {
    for (const id of MANUAL_MOOD_IDS) {
      expect(MOOD_BY_ID[id]).toBeDefined();
    }
  });
});

describe('NOTIFICATION_MOOD_IDS', () => {
  it('surfaces all 7 moods in declared order', () => {
    expect(NOTIFICATION_MOOD_IDS).toEqual([
      'happy',
      'sad',
      'angry',
      'calm',
      'excited',
      'surprised',
      'neutral',
    ]);
  });

  it('is a superset of MANUAL_MOOD_IDS', () => {
    for (const id of MANUAL_MOOD_IDS) {
      expect(NOTIFICATION_MOOD_IDS).toContain(id);
    }
  });

  it('covers exactly the full MOODS set', () => {
    expect(NOTIFICATION_MOOD_IDS.slice().sort()).toEqual(
      MOODS.map((m) => m.id).sort(),
    );
  });
});

describe('CATALOG_TO_MOOD', () => {
  // Built by inverting MOOD_TO_CATALOG (first/primary mood wins) then adding
  // love/heartbroken/nervous. 'calm' is the folder for both calm + neutral,
  // and MOODS iterates calm before neutral, so catalog 'calm' → 'calm'.
  it.each<[string, MoodId]>([
    ['happy', 'happy'],
    ['excited', 'excited'],
    ['calm', 'calm'], // calm wins over neutral (declared first in MOODS)
    ['angry', 'angry'],
    ['crying', 'sad'], // MOOD_TO_CATALOG: sad → crying
    ['confused', 'surprised'], // MOOD_TO_CATALOG: surprised → confused
    ['love', 'happy'], // extra folder, hand-added
    ['heartbroken', 'sad'], // extra folder, hand-added
    ['nervous', 'neutral'], // extra folder, hand-added
  ])('catalog "%s" → %s', (catalogKey, mood) => {
    expect(CATALOG_TO_MOOD[catalogKey]).toBe(mood);
  });

  it('does NOT map "calm" to neutral (primary-wins rule)', () => {
    expect(CATALOG_TO_MOOD.calm).not.toBe('neutral');
  });

  it('every value is a valid MoodId', () => {
    const validIds = MOODS.map((m) => m.id);
    for (const v of Object.values(CATALOG_TO_MOOD)) {
      expect(validIds).toContain(v);
    }
  });
});
