/* ============================================================
   config.js — THE ONLY FILE THE OWNER EDITS.
   Plain data only (no functions). Every changeable string
   lives here and only here.
   ============================================================ */
window.CONFIG = {
  name: "Xang",                            // appears in the greeting and the <title> after the reveal
  greeting: "Happy Birthday, {name}!",    // {name} is replaced with the name above
  tabTitle: "\uD83C\uDF88",               // neutral tab title so the gift isn't spoiled
  // Letter fallback (used on file:// double-click). On a server the LETTER
  // file is loaded instead — keep this copy in sync with it.
  letterTitle: "HAPPY BIRTHDAY XANG!!",
  letterParagraphs: [
    "It's been a while na like almost three years since we've seen each other and even our einstein classmates HAHAHAHA. Hope you're doing well out there and have more years to come.",
    "As for my gift, it's something that cant be bought or spent, but found in the memories we have lived and shared during our years sa G10 2024-2025. HAPPY BIRTHDAY.",
    "p.s. gi download ra nako tanan pics and vids sa gc HAHAHAH pi bday"
  ],
  signature: "- ur bff Romer",
  memoriesFolder: "assets/memories",      // numbered files 1.png, 2.mp4 … shown in Open memories + photo balloons
  memoriesCount: 26,                      // tries 1 … N; missing numbers are skipped silently
  letterDelayMs: 7000,                    // letter auto-opens this long after the pop
  music: "assets/music.mp3",              // "" = built-in procedural music box; otherwise plays this file if it exists
  theme: { hueA: 335, hueB: 35 }         // drives the celebration background gradient
};
