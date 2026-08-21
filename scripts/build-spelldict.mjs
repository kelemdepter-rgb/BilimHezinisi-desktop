/**
 * Build the Uyghur spellcheck dictionary the app ships.
 *
 * Run:  npm run build-spelldict
 *
 * Sources (all local, all committed):
 *   assets/spellcheck/uyghur_words.txt        the UyghurSpell inflected forms
 *   assets/spellcheck/uyghur_corrections.json the hand-collected wrong → right pairs
 *   spellcheck-data/vocabulary.txt            corpus admissions, reviewed
 *   spellcheck-data/frequencies.tsv           how often the published library uses a word
 *   spellcheck-data/productive-stems.txt      stems the dictionary inflects widely
 *
 * Output:
 *   assets/spellcheck/uyghur-dict.bin         words, front-coded, one byte per letter
 *   assets/spellcheck/uyghur_corrections.json rewritten with the reviewed pairs merged in
 *
 * Ported from the web edition's scripts/build-spelldict.mjs. What changed: the
 * word list and the tables are read from this repository instead of a sibling
 * checkout, nothing reaches a database, and the held-out-collision check is
 * gone with the evaluation fixture it guarded. The encoding, the flag byte and
 * the round-trip proof are untouched.
 *
 * THE ENCODING. The words use exactly 34 distinct characters — 33 Uyghur
 * letters and the hyphen that joins compounds — counted from the list itself,
 * so one byte each is exact rather than a compromise. The previous format
 * stored them as UTF-8 text, where every Uyghur letter costs two bytes, and the
 * renderer then held them in a JavaScript string, where each costs two more;
 * both doublings go away together. Front coding survives the change and gets a
 * little better at it, because the shared-prefix length is now a whole byte
 * instead of a character offset from '0' that capped it at 74.
 *
 * PROVING IT IS LOSSLESS. Any character outside the table is a build error, not
 * a dropped word. Then the finished buffer is decoded back and compared to the
 * input word for word — not a sample, all of them — and the build refuses to
 * write if a single one differs or if the count moved. An encoding change that
 * silently corrupted one word in a hundred thousand would be invisible in every
 * other measurement in this project, so it is checked here.
 *
 * ONE BYTE PER WORD MORE. The artifact carries a flags byte alongside each
 * word: the low four bits are how often the published library uses it (log2
 * bucket), and the top bit marks a stem the dictionary inflects widely. The
 * ranking needs the first to stop breaking ties alphabetically and the
 * morphology needs the second to refuse obscure stems.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { packDictionary, unpackDictionary } from "./lib/codec.mjs";
import {
  allWords,
  baseWords,
  dataDir,
  desktopAssets,
  multiWordEntries,
  vocabularyCorrections,
} from "./lib/wordlist.mjs";

const outDir = desktopAssets;

/** Top bit of the flags byte; mirrors PRODUCTIVE_STEM in src/spellcheck/dictionary.js. */
const PRODUCTIVE_STEM = 0x80;

function readTable(name, parse) {
  const path = join(dataDir, name);
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, "utf-8"));
}

/** The old text format, kept only to measure what the change actually saved. */
function frontCodeAsText(sortedWords) {
  const lines = [];
  let previous = "";
  for (const word of sortedWords) {
    let shared = 0;
    while (
      shared < previous.length &&
      shared < word.length &&
      previous[shared] === word[shared] &&
      shared < 74
    ) {
      shared++;
    }
    lines.push(String.fromCharCode(48 + shared) + word.slice(shared));
    previous = word;
  }
  return lines.join("\n");
}

const served = (buffer) =>
  brotliCompressSync(Buffer.from(buffer), { params: { [constants.BROTLI_PARAM_QUALITY]: 3 } }).length;

async function main() {
  const words = allWords();
  const base = baseWords();

  const frequencies = readTable("frequencies.tsv", (text) => {
    const table = new Map();
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const [word, bucket] = line.split("\t");
      table.set(word, Number(bucket));
    }
    return table;
  });
  const productive = readTable("productive-stems.txt", (text) => new Set(text.split("\n").filter(Boolean)));

  // STOP rather than build a quietly worse dictionary.
  //
  // Warning and carrying on produced an artifact that loads, passes its round
  // trip, and looks entirely healthy — while the ranking falls back to having
  // no idea which words people actually write, which is the exact failure this
  // engine exists to fix. A build that cannot do its job should say so and stop.
  const missing = [
    !frequencies && "frequencies.tsv",
    !productive && "productive-stems.txt",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(`\nMissing data the dictionary needs:\n`);
    for (const file of missing) console.error(`  spellcheck-data/${file}`);
    console.error(
      "\nBoth tables are derived from the published library and are committed to\n" +
        "this repository. Restore them from git rather than building without them:\n" +
        "a rebuild that skipped them would ship a dictionary that ranks corrections\n" +
        "worse while looking perfectly fine.\n",
    );
    process.exit(1);
  }

  const flags = new Uint8Array(words.length);
  let withFrequency = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const bucket = frequencies?.get(word) ?? 0;
    if (bucket > 0) withFrequency++;
    flags[index] = Math.min(bucket, 15) | (productive?.has(word) ? PRODUCTIVE_STEM : 0);
  }

  const packed = packDictionary(words, flags);

  // ── the lossless check, on every word ────────────────────────────────────
  const roundTrip = unpackDictionary(packed);
  if (roundTrip.words.length !== words.length) {
    console.error(`Round trip changed the count: ${words.length} → ${roundTrip.words.length}`);
    process.exit(1);
  }
  for (let index = 0; index < words.length; index++) {
    if (roundTrip.words[index] !== words[index]) {
      console.error(`Round trip changed word ${index}: ${words[index]} → ${roundTrip.words[index]}`);
      process.exit(1);
    }
  }
  for (let index = 0; index < words.length; index++) {
    if (roundTrip.frequencies[index] !== flags[index]) {
      console.error(`Round trip changed the flags of ${words[index]}`);
      process.exit(1);
    }
  }

  // ── corrections: the shipped table, plus the ones written while reviewing ─
  const correctionsPath = join(desktopAssets, "uyghur_corrections.json");
  const corrections = JSON.parse(await readFile(correctionsPath, "utf-8"));
  const reviewed = vocabularyCorrections();

  let added = 0;
  for (const [wrong, right] of reviewed) {
    corrections[wrong] = right;
    added++;
  }

  // A dictionary entry is one word. A reviewer can rightly write two — the
  // corpus joins forms Uyghur keeps apart — so say what happened to them rather
  // than dropping them quietly.
  const phrases = multiWordEntries();
  if (phrases.length > 0) {
    console.log(
      `\n${phrases.length} reviewed entries are more than one word. They are offered as` +
        `\ncorrections but not added to the dictionary, which holds single words only:` +
        `\n  ${phrases.join(", ")}`,
    );
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "uyghur-dict.bin"), packed);
  await writeFile(correctionsPath, JSON.stringify(corrections), "utf-8");

  // ── what it cost, like for like ──────────────────────────────────────────
  const oldText = frontCodeAsText(base);
  const oldBytes = Buffer.byteLength(oldText, "utf-8");
  const oldServed = served(Buffer.from(oldText, "utf-8"));
  const sameListPacked = packDictionary(base, null);
  const newServed = served(packed);

  const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
  const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

  console.log(`words:              ${words.length.toLocaleString("en-US")}`);
  console.log(`  from the desktop: ${base.length.toLocaleString("en-US")}`);
  console.log(`  from the library: ${(words.length - base.length).toLocaleString("en-US")}`);
  console.log(`  with a frequency: ${withFrequency.toLocaleString("en-US")}`);
  console.log(`corrections:        ${Object.keys(corrections).length.toLocaleString("en-US")}  (${added} written while reviewing)`);
  console.log();
  console.log(`SAME ${base.length.toLocaleString("en-US")} WORDS, both encodings:`);
  console.log(`  text, raw         ${mb(oldBytes)}      served ${kb(oldServed)}`);
  console.log(`  bytes, raw        ${mb(sameListPacked.length)}      served ${kb(served(sameListPacked))}`);
  console.log();
  console.log(`SHIPPED artifact (${words.length.toLocaleString("en-US")} words + flags):`);
  console.log(`  uyghur-dict.bin   ${packed.length.toLocaleString("en-US")} bytes  (${mb(packed.length)})`);
  console.log(`  corrections.json  ${Buffer.byteLength(JSON.stringify(corrections), "utf-8").toLocaleString("en-US")} bytes`);
  console.log(`  for reference     ${kb(newServed)} brotli q3 · ${kb(gzipSync(Buffer.from(packed), { level: 9 }).length)} gzip -9`);
  console.log();
  console.log(`Round trip verified on all ${words.length.toLocaleString("en-US")} words and their flags.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
