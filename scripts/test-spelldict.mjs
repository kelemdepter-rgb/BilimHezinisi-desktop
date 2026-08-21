/**
 * Offline harness for the spellchecker, so its behaviour can be checked without
 * opening the app.
 *
 * Run:  npm run test-spelldict
 *
 * It loads the SHIPPED artifact through the SAME engine the main process uses —
 * no reimplementation, which is what the previous version of this script did and
 * why it could pass while the app failed. Two things are asserted:
 *
 *   the words that must be underlined, with the correction that must come first
 *   the words that must NOT be underlined, which is what the morphology bought
 *
 * Every case here is a real Uyghur word or a real mistake, not a synthetic one.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const engine = require(join(here, "..", "src", "spellcheck", "engine.js"));

/** wrong → the correction that must be offered FIRST. */
const MUST_CORRECT = [
  ["قالدورمىغۇدەك", "قالدۇرمىغۇدەك"],
  ["تەۋەلىنگەن", "تەۋەلەنگەن"],
  ["ئەۋىج", "ئەۋج"],
  ["قىلامماي", "قىلالماي"],
  ["بوماستىن", "بولماستىن"],
  ["چوقۇرلاشقان", "چوڭقۇرلاشقان"],
];

/** Ordinary Uyghur the list does not contain — the morphology must accept it. */
const MUST_ACCEPT = ["تەۋەلەنگەن", "ياخشىلىنىش"];

const started = Date.now();
const info = engine.init([]);
if (!info.ready) {
  console.error(`\nThe dictionary did not load: ${info.reason}`);
  console.error("Build it with:  npm run build-spelldict\n");
  process.exit(1);
}
console.log(`${info.words.toLocaleString("en-US")} words + ${info.corrections.toLocaleString("en-US")} corrections in ${info.loadMs} ms\n`);

let failures = 0;

for (const [wrong, right] of MUST_CORRECT) {
  const flagged = !engine.check(wrong);
  const t0 = Date.now();
  const suggestions = engine.suggest(wrong);
  const ms = Date.now() - t0;
  const first = suggestions[0] || "(nothing)";
  const ok = flagged && first === right;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${wrong}  →  ${first}` +
      `${ok ? "" : `   expected ${right}`}   [underlined: ${flagged}, ${ms} ms]`,
  );
  if (!ok) console.log(`        top 3: ${suggestions.slice(0, 3).join(", ") || "(none)"}`);
}

for (const word of MUST_ACCEPT) {
  const ok = engine.check(word);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${word}  accepted without being listed`);
}

// A page of text, to show the cost of the thing that runs on every pause.
const page = new Array(400).fill("ئىلىم تەلەپ قىلىش ھەر بىر مۇسۇلمانغا پەرزدۇر.").join(" ");
const t0 = Date.now();
const marks = engine.checkText(page);
console.log(
  `\nchecked ${page.split(/\s+/).length.toLocaleString("en-US")} words in ${Date.now() - t0} ms` +
    `  (${marks.length} flagged)`,
);
console.log(`total ${Date.now() - started} ms`);

if (failures > 0) {
  console.error(`\n${failures} case(s) failed.`);
  process.exit(1);
}
console.log("\nAll cases passed.");
