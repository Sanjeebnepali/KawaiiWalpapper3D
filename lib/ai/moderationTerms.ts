/**
 * Prohibited-content term tables for the AI prompt moderator.
 *
 * DATA ONLY — no logic lives here (exempt from the file-size cap; it's a
 * table, not code). The matching logic is in `promptModeration.ts`.
 *
 * MATCHING CONTRACT (so editing these lists stays predictable):
 *   - Store every term LOWERCASE, with NO punctuation, words separated by
 *     a single space. The moderator normalises the user's prompt the same
 *     way ("Spider-Man!" -> "spider man"), then tests `' <term> '` against
 *     the space-padded prompt. That gives WORD-BOUNDARY matching for free:
 *     "war" matches "a war scene" but NOT "warm" or "award", and "spider
 *     man" matches a multi-word phrase.
 *   - Because of word boundaries, plurals/variants must be listed
 *     explicitly ("gun" AND "guns"). That's intentional — explicit beats a
 *     clever stemmer that mis-fires.
 *
 * FALSE-POSITIVE DISCIPLINE (this is a kawaii *baby* wallpaper app):
 *   - Core child words (baby, toddler, child…) live ONLY in MINOR_TERMS and
 *     never block on their own — they only matter when paired with a sexual
 *     term (see promptModeration's co-occurrence rule).
 *   - Cute-but-spooky kawaii staples (ghost, skull, pumpkin, witch, zombie)
 *     and cute foods (apple, cherry) are deliberately NOT banned — "kawaii
 *     ghost" / "kawaii apple" are valid, popular prompts. Only unambiguous
 *     terms are listed.
 *   - Ambiguous brand words ("apple", "supreme", "puma") are excluded; only
 *     unambiguous brand tokens or "<brand> logo" phrases are listed.
 *
 * These lists are not exhaustive and a determined user can obfuscate
 * (leetspeak, paraphrase). This is a first-line client gate; the provider's
 * own safety filter (ImageGenError reason `safety_filter`) is the backstop.
 */

// ─── Child safety — explicit single-term flags (highest severity) ─────────
// Terms whose only meaning is child sexual abuse material. Any one blocks.
export const CHILD_SAFETY_TERMS: readonly string[] = [
  'loli', 'lolicon', 'shota', 'shotacon', 'jailbait', 'csam',
  'child porn', 'child pornography', 'childporn', 'child sex', 'childsex',
  'pedophile', 'pedophilia', 'pedo', 'paedophile', 'paedophilia',
];

// ─── Co-occurrence groups ────────────────────────────────────────────────
// A minor term + a sexual term together => child-safety block. Neither
// group blocks alone (MINOR_TERMS are the app's bread and butter; sexual
// terms are handled by SEXUAL_TERMS as an adult-content block).
export const MINOR_TERMS: readonly string[] = [
  'baby', 'babies', 'toddler', 'toddlers', 'infant', 'infants', 'newborn',
  'child', 'children', 'kid', 'kids', 'minor', 'minors', 'preschooler',
  'kindergartner', 'little girl', 'little boy', 'young girl', 'young boy',
  'baby girl', 'baby boy', 'schoolgirl', 'schoolboy', 'teen', 'teenage',
  'teenager', 'underage', 'juvenile', 'prepubescent', 'tween',
];

// ─── Sexual / adult content ───────────────────────────────────────────────
export const SEXUAL_TERMS: readonly string[] = [
  'nude', 'nudes', 'naked', 'nudity', 'topless', 'bottomless', 'undressed',
  'undressing', 'sex', 'sexual', 'sexy', 'porn', 'porno', 'pornographic',
  'pornography', 'nsfw', 'erotic', 'erotica', 'hentai', 'ecchi', 'lewd',
  'fetish', 'bdsm', 'bondage', 'lingerie', 'panties', 'thong', 'negligee',
  'seductive', 'suggestive', 'provocative', 'sensual', 'voluptuous',
  'cleavage', 'busty', 'curvy', 'scantily', 'striptease', 'stripping',
  'orgasm', 'genitals', 'genitalia', 'breasts', 'boobs', 'nipples',
  'buttocks', 'crotch', 'upskirt', 'cameltoe', 'fishnet',
  // Swimwear / underwear — prohibited on child characters; this app's
  // characters are children, so these are treated as blocks.
  'bikini', 'swimsuit', 'swimwear', 'underwear', 'bra', 'briefs',
];

// ─── Violence / gore / weapons / self-harm / substances / cruelty ─────────
export const VIOLENCE_TERMS: readonly string[] = [
  'blood', 'bloody', 'bloodied', 'gore', 'gory', 'gruesome',
  'decapitate', 'decapitated', 'behead', 'beheading', 'dismember',
  'dismembered', 'mutilate', 'mutilated', 'mutilation', 'massacre',
  'slaughter', 'carnage', 'corpse', 'corpses', 'dead body', 'murder',
  'murdered', 'kill', 'killed', 'killing', 'stab', 'stabbed', 'stabbing',
  'gunshot', 'shooting someone', 'gunfight', 'torture', 'tortured',
  'torturing', 'beaten up', 'assaulted', 'violence', 'violent', 'brutal',
  'brutally', 'war', 'warfare', 'combat', 'battlefield',
  // Weapons (clearly-weapon tokens only; bare "knife"/"sword" omitted to
  // spare cute kitchen/fantasy prompts).
  'gun', 'guns', 'rifle', 'pistol', 'shotgun', 'handgun', 'firearm',
  'firearms', 'machine gun', 'machete', 'grenade',
  // Self-harm / suicide.
  'suicide', 'self harm', 'selfharm', 'noose', 'overdose',
  // Substance abuse.
  'cocaine', 'heroin', 'meth', 'methamphetamine', 'marijuana', 'cannabis',
  'smoking weed', 'injecting drugs', 'drug abuse', 'drunk', 'alcoholic',
  'alcohol abuse',
  // Animal cruelty.
  'animal cruelty', 'animal abuse', 'killing animals', 'torturing animals',
];

// ─── Hate / extremist symbols ─────────────────────────────────────────────
// Explicit slurs are intentionally NOT enumerated in source; the symbol /
// group terms below cover the visual cases, and the provider's safety
// filter backstops slurs.
export const HATE_TERMS: readonly string[] = [
  'nazi', 'nazis', 'neo nazi', 'swastika', 'swastikas', 'hitler',
  'heil hitler', 'kkk', 'ku klux klan', 'confederate flag', 'white power',
  'white supremacy', 'white supremacist', 'fascist symbol', 'antisemitic',
  'antisemitism', 'holocaust', 'ethnic cleansing', 'racial slur',
  'ethnic slur', 'hate symbol', 'hate group', 'islamophobic',
];

// ─── Illegal activity / dangerous instructions ────────────────────────────
// "bomb" alone is omitted on purpose ("bath bomb" is a cute kawaii object);
// only weaponised compounds are listed.
export const ILLEGAL_TERMS: readonly string[] = [
  'explosive', 'explosives', 'dynamite', 'molotov', 'pipe bomb', 'car bomb',
  'suicide bomb', 'detonate', 'ied', 'meth lab', 'drug lab',
  'making drugs', 'manufacturing drugs', 'hacking', 'cybercrime',
  'ransomware', 'malware', 'kidnap', 'kidnapping', 'human trafficking',
  'sex trafficking', 'robbery', 'heist', 'counterfeit', 'counterfeiting',
  'fake money', 'fake passport', 'forgery',
];

// ─── Real people / deepfakes / celebrities / named public figures ─────────
// Intent terms plus a curated (non-exhaustive) set of names users commonly
// try. The provider filter and this list together raise the bar.
export const REAL_PERSON_TERMS: readonly string[] = [
  'deepfake', 'deep fake', 'real person', 'real celebrity', 'celebrity face',
  'celebrity likeness', 'real politician', 'real athlete', 'without consent',
  'real child photo', 'real children photo', 'photo of a real',
  // Curated public-figure names (not exhaustive).
  'taylor swift', 'elon musk', 'donald trump', 'joe biden', 'kim kardashian',
  'cristiano ronaldo', 'lionel messi', 'kanye west', 'billie eilish',
  'beyonce', 'ariana grande', 'selena gomez', 'dwayne johnson', 'tom cruise',
  'leonardo dicaprio', 'brad pitt', 'angelina jolie', 'barack obama',
  'vladimir putin', 'narendra modi', 'pope francis', 'queen elizabeth',
  'kim jong un',
];

// ─── Political / propaganda / civic incitement ────────────────────────────
export const POLITICAL_TERMS: readonly string[] = [
  'political propaganda', 'election interference', 'rigged election',
  'flag burning', 'burning the flag', 'flag desecration', 'storm the capitol',
  'government building attack', 'protest incitement', 'incite a riot',
  'religious mockery', 'blasphemy', 'mock the prophet',
];

// ─── Misinformation / impersonation ───────────────────────────────────────
export const MISINFO_TERMS: readonly string[] = [
  'fake news', 'fake newspaper', 'conspiracy theory', 'qanon', 'flat earth',
  'anti vaccine', 'antivax', 'fake emergency', 'fake amber alert',
  'fake police report', 'impersonating',
];

// ─── Horror / occult / grotesque (not child-friendly) ─────────────────────
// Restricted to terms with no cute reading. Cute-spooky kawaii words
// (ghost, skull, skeleton, zombie, witch, pumpkin, spooky) are NOT listed.
export const HORROR_TERMS: readonly string[] = [
  'horror', 'gory horror', 'grotesque', 'disturbing imagery', 'satanic',
  'satanism', 'pentagram', 'demonic ritual', 'occult ritual', 'exorcism',
  'bloodcurdling', 'nightmare fuel', 'jumpscare', 'slasher', 'snuff',
];

// ─── Trademarked / copyrighted characters, brands, famous artwork ─────────
export const IP_TERMS: readonly string[] = [
  // Disney / Pixar.
  'mickey mouse', 'minnie mouse', 'donald duck', 'goofy', 'elsa', 'anna',
  'olaf', 'frozen', 'moana', 'maui', 'ariel', 'little mermaid', 'simba',
  'mufasa', 'nala', 'woody', 'buzz lightyear', 'mike wazowski', 'sulley',
  'mulan', 'aladdin', 'jasmine', 'genie', 'rapunzel', 'tangled', 'belle',
  'cinderella', 'snow white', 'sleeping beauty', 'pocahontas', 'tinker bell',
  'peter pan', 'winnie the pooh', 'tigger', 'eeyore', 'dumbo', 'bambi',
  'lilo', 'stitch', 'encanto', 'mirabel', 'baymax', 'big hero 6',
  // DreamWorks / Illumination.
  'shrek', 'fiona', 'puss in boots', 'kung fu panda', 'toothless',
  'minions', 'gru', 'despicable me', 'madagascar', 'trolls', 'poppy troll',
  // Marvel.
  'spider man', 'spiderman', 'iron man', 'ironman', 'captain america',
  'the hulk', 'thor', 'black widow', 'black panther', 'doctor strange',
  'scarlet witch', 'wolverine', 'deadpool', 'venom', 'thanos', 'groot',
  'ant man', 'captain marvel', 'loki', 'avengers',
  // DC.
  'batman', 'superman', 'wonder woman', 'the flash', 'aquaman',
  'green lantern', 'joker', 'harley quinn', 'catwoman', 'supergirl',
  'batgirl', 'justice league',
  // Anime / manga.
  'naruto', 'sasuke', 'kakashi', 'goku', 'vegeta', 'gohan', 'dragon ball',
  'luffy', 'zoro', 'one piece', 'pikachu', 'charizard', 'bulbasaur',
  'squirtle', 'eevee', 'mewtwo', 'pokemon', 'sailor moon', 'totoro',
  'ponyo', 'spirited away', 'demon slayer', 'tanjiro', 'nezuko',
  'attack on titan', 'jujutsu kaisen', 'gojo', 'my hero academia', 'deku',
  'doraemon', 'astro boy', 'evangelion',
  // Sanrio.
  'hello kitty', 'kitty white', 'my melody', 'kuromi', 'cinnamoroll',
  'pompompurin', 'keroppi', 'gudetama', 'pochacco', 'little twin stars',
  'aggretsuko',
  // Nintendo / Sega.
  'mario', 'luigi', 'princess peach', 'bowser', 'yoshi', 'donkey kong',
  'zelda', 'ganon', 'kirby', 'samus', 'metroid', 'pikmin', 'splatoon',
  'animal crossing', 'isabelle', 'sonic the hedgehog', 'tails', 'knuckles',
  // KPop Demon Hunters.
  'kpop demon hunters', 'huntrix', 'saja boys',
  // Other big franchises.
  'harry potter', 'hogwarts', 'hermione', 'dumbledore', 'voldemort',
  'star wars', 'darth vader', 'yoda', 'baby yoda', 'grogu', 'mandalorian',
  'stormtrooper', 'lightsaber', 'minecraft', 'creeper', 'fortnite',
  'roblox', 'among us', 'pac man', 'pacman', 'five nights at freddys',
  'freddy fazbear', 'bluey', 'peppa pig', 'paw patrol', 'cocomelon',
  'spongebob', 'patrick star', 'squidward', 'rick and morty', 'the simpsons',
  'bart simpson', 'family guy', 'south park', 'garfield', 'snoopy',
  'scooby doo', 'tom and jerry', 'bugs bunny', 'barbie', 'hot wheels',
  'transformers', 'optimus prime', 'my little pony', 'rainbow dash',
  'care bears', 'powerpuff girls', 'teletubbies', 'smurfs',
  // Brands (unambiguous tokens / logo phrases only).
  'nike', 'adidas', 'gucci', 'prada', 'chanel', 'louis vuitton', 'versace',
  'balenciaga', 'rolex', 'ferrari', 'lamborghini', 'starbucks', 'mcdonalds',
  'coca cola', 'pepsi', 'apple logo', 'nike logo', 'playstation logo',
  'xbox logo', 'nintendo logo', 'disney logo', 'marvel logo', 'nasa logo',
  // Famous artwork (artist / unambiguous titles).
  'mona lisa', 'van gogh', 'the scream painting', 'girl with a pearl earring',
  'the last supper', 'american gothic', 'birth of venus',
  'the great wave off kanagawa', 'leonardo da vinci painting',
  'picasso painting', 'monet painting',
];
