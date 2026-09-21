// Content of the "Jev examples" sheet: onboarding for users, and a working
// demo for Marketplace reviewers. Pure data so it can be tested.

export const EXAMPLES_SHEET_NAME = "Jev examples";

const TEXTS: [string, string][] = [
  ["I was charged twice this month, please refund the duplicate ASAP!", "Order #4821"],
  ["Love the new dashboard, the dark mode is fantastic. Great work!", ""],
  ["The app crashes every time I open Settings on my phone.", "Android 15, Pixel 8"],
  ["How much does the Pro plan cost for a team of 12?", ""],
  ["Still waiting for a reply to my ticket from last week. This is unacceptable.", "Ticket #991"],
  ["Can I export my data to CSV?", ""],
];

/** Header, example rows, formulas (row 2 fills down via ranges), and notes. */
export function examplesSheet(): { values: string[][]; formulas: { cell: string; formula: string }[]; notes: string[][] } {
  const last = TEXTS.length + 1;
  const values = [
    ["Message", "Details", "Complaint?", "P(complaint)", "Team", "Team (only if sure)", "Frustration (1–3)", "Has an ID?"],
    ...TEXTS.map(([m, d]) => [m, d, "", "", "", "", "", ""]),
  ];
  const formulas = [
    { cell: "C2", formula: `=JEV_IF(A2:A${last}, "Is this message a complaint?")` },
    { cell: "D2", formula: `=JEV_PROB(A2:A${last}, "Is this message a complaint?")` },
    { cell: "E2", formula: `=JEV_CHOICE(A2:A${last}, "billing, technical, sales, feedback", "Which team should handle this message?")` },
    { cell: "F2", formula: `=JEV_CHOICE(A2:A${last}, "billing, technical, sales, feedback", "Which team should handle this message?", 0.8)` },
    { cell: "G2", formula: `=JEV_SCORE(A2:A${last}, "How frustrated is the writer?", "calm, annoyed, furious")` },
    { cell: "H2", formula: `=JEV_IF(A2:B${last}, "Does this include an order number, ticket number or device model?")` },
  ];
  const notes = [
    [
      "",
      "",
      "JEV_IF: yes/no → TRUE/FALSE. One formula fills the whole column.",
      "JEV_PROB: probability of yes, 0–1.",
      "JEV_CHOICE: picks one option.",
      "Same, but returns UNSURE when confidence is below 0.8.",
      "JEV_SCORE: 1 = first level … 3 = last; can land between levels.",
      "Two columns (A:B) → each row is judged on both cells together.",
    ],
  ];
  return { values, formulas, notes };
}
