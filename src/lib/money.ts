const fmt = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format pesewas as "GH₵ 1,250.00". */
export function cedis(pesewas: number): string {
  return `GH₵ ${fmt.format(pesewas / 100)}`;
}

/** Parse a keypad string like "12.5" to pesewas (1250). Returns 0 for empty/invalid. */
export function toPesewas(input: string): number {
  if (!/^\d*(\.\d{0,2})?$/.test(input) || input === "" || input === ".") return 0;
  const [whole, frac = ""] = input.split(".");
  return Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
}

/** Apply a keypad press to the amount string, enforcing 2 decimals and a sane length. */
export function pressAmountKey(current: string, key: string): string {
  if (key === "back") return current.slice(0, -1);
  if (key === ".") {
    if (current.includes(".")) return current;
    return (current || "0") + ".";
  }
  if (current.includes(".") && current.split(".")[1].length >= 2) return current;
  if (!current.includes(".") && current.replace(/^0+/, "").length >= 6) return current;
  if (current === "0") return key;
  return current + key;
}

/** Show a keypad amount string with thousands separators, e.g. "1,250.5". */
export function displayAmount(input: string): string {
  if (!input) return "0.00";
  const [whole, frac] = input.split(".");
  const w = Number(whole || "0").toLocaleString("en-GH");
  return frac === undefined ? w : `${w}.${frac}`;
}
