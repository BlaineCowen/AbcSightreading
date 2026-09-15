/** Print the planned form for each level, against the two transcriptions. */
import { planForm, describeForm, requiredMeasures } from "../../src/lib/form-plan";

const seeded = (n: number) => () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);

for (const level of [1, 2, 3, 4, 5]) {
  for (const meter of ["4/4", "3/4"]) {
    const [min, max] = requiredMeasures(level, meter);
    if (meter === "3/4") {
      console.log(`  (${meter}: ${min}-${max} bars)`);
      continue;
    }
    console.log();
    for (const line of describeForm(planForm({ level, meter, rng: seeded(level * 7 + 1) }))) {
      console.log(line);
    }
    console.log(`  required ${min}-${max} bars in ${meter}`);
  }
}
