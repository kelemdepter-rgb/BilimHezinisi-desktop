/**
 * The word list the dictionary build agrees on.
 *
 * Two sources, and the order matters only in that both are deduplicated:
 *
 *   assets/spellcheck/uyghur_words.txt   441,322 fully inflected forms — the
 *                                        UyghurSpell list this app has always
 *                                        shipped. It stays in the repository as
 *                                        the SOURCE even though the packaged
 *                                        app now ships the binary artifact
 *                                        built from it.
 *   spellcheck-data/vocabulary.txt       words the published library attests
 *                                        and the list above lacks, reviewed one
 *                                        by one and committed.
 *
 * Reading the source rather than the built artifact matters: the artifact is an
 * output, and a script that mined its own previous output would drift a little
 * further from the truth on every rebuild.
 *
 * Ported from the web edition's scripts/lib/wordlist.mjs. Only the paths
 * changed: there, the desktop word list was read across the disk from a sibling
 * checkout; here it is simply local.
 */
import { readFileSync, existsSync } from "node:fs";
import { readVocabulary } from "./vocabulary.mjs";
import { encodable } from "./uyghur.mjs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

export const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)), "..");
export const desktopAssets = join(repoRoot, "assets", "spellcheck");

/** The shipped list alone, which is what the "before" measurements are against. */
export function baseWords() {
  const path = join(desktopAssets, "uyghur_words.txt");
  if (!existsSync(path)) {
    console.error(
      `\nThe source word list was not found at\n  ${path}\n` +
        "It is committed to this repository; restore it before rebuilding.\n",
    );
    process.exit(1);
  }
  const raw = readFileSync(path, "utf-8");
  return [...new Set(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].sort();
}

const vocabularyPath = () => join(repoRoot, "spellcheck-data", "vocabulary.txt");

/**
 * Words admitted from the corpus, as reviewed.
 *
 * A word the owner marked wrong is NOT here — the whole point of marking it is
 * to keep it out. Its correction is, though, because a word someone had to
 * write out by hand is a word this library uses.
 */
export function vocabularyWords() {
  const words = [];
  for (const entry of readVocabulary(vocabularyPath())) {
    // A dictionary entry is ONE word, and the encoding has no space in it.
    // A reviewer can legitimately write two — «ۋەياكى» is properly «ۋە ياكى»,
    // and the corpus joins pairs that Uyghur keeps apart — so those are held
    // back from the word list here. They are not lost: a two-word correction is
    // still a perfectly good CORRECTION, offered in the popup and substituted
    // whole, which is what vocabularyCorrections below keeps.
    const candidate =
      entry.decision === "admitted"
        ? entry.word
        : entry.decision === "corrected"
          ? entry.correction
          : null;
    if (candidate && encodable(candidate)) words.push(candidate);
  }
  return words;
}

/** Entries that cannot be dictionary words, so the build can say so out loud. */
export function multiWordEntries() {
  const out = [];
  for (const entry of readVocabulary(vocabularyPath())) {
    if (entry.decision === "admitted" && !encodable(entry.word)) out.push(entry.word);
    if (entry.decision === "corrected" && !encodable(entry.correction)) out.push(entry.correction);
  }
  return out;
}

/**
 * The wrong → right pairs the owner wrote while reviewing.
 *
 * These are worth more than the deletions they replace. A deletion only keeps a
 * misspelling out of the dictionary; a correction also tells the checker what
 * was meant, so the next person who types it is offered the right word first.
 */
export function vocabularyCorrections() {
  const pairs = new Map();
  for (const entry of readVocabulary(vocabularyPath())) {
    if (entry.decision === "corrected") pairs.set(entry.word, entry.correction);
  }
  return pairs;
}

/** Everything the shipped dictionary should contain, sorted and deduplicated. */
export function allWords() {
  return [...new Set([...baseWords(), ...vocabularyWords()])].sort();
}

/** Where the build's own input tables live. */
export const dataDir = join(repoRoot, "spellcheck-data");
