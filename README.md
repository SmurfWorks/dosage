# Dosage Helper

A personal calculator for carbohydrate and insulin doses, built as a progressive web app you can install on a phone. Everything stays on the device. The build output is the `docs` folder, ready for GitHub Pages.

It applies the ratios you enter. It does not replace a diabetes care plan.

## The calculator

Enter your current glucose, the carbs you are about to eat, and any fibre. The glucose has whole-number and small-step buttons on either side; carbs and fibre step by 10 g on the left and 1 g on the right, and every field can be typed into. Fibre is taken off the carbs before the dose ("Calculated carbs"), and can be hidden in **Set your routine**.

The suggestion stays hidden until you change the glucose, carbs, or fibre. Then:

- **Above the range, or a meal that would finish above the target:** the bolus that reaches the target, rounded to your pen or pump.
- **Inside the range with no food, or a meal that already finishes inside the range:** no bolus.
- **Below the range:** no bolus, plus the grams of carbohydrate that would reach the target.

**Recent bolus warning.** When it suggests a bolus and you logged one in the last 4 hours, a warning under the dose gives that dose and how long ago it was. The suggestion does not subtract insulin that may still be working.

The island at the foot of the screen shows the **Calculated target**, the glucose the dose is meant to reach, or **Maintaining target** when nothing changes it. **Show the working** lists each step of the maths. Untick Carbs or Insulin Dosage to leave either out.

**Dishes**, beside Carbs, keeps the dishes you eat often with their carbs and fibre. It lists your three most-picked dishes; search by name to find others. Tap a dish to fill in its amounts. Above the list, **Portion** picks ½, 1, 1½ or 2 of the dish, and once carbs are entered **Fill in** offers **Add to** them instead of replacing them, to build a meal from several dishes. Both start at Replace and 1 each time Dishes opens. **Add a dish** takes a name and its grams with the same stepped inputs, shows the calculated carbs once there is fibre, and starts with the amounts already entered. Saving a name you already have updates that dish and keeps its place in the list. The pencil on a dish opens it in **Edit dish**, to change its grams or rename it. Remove a dish with its ×, and **Undo** brings it back. With no dishes yet, the form opens straight away.

The app follows the phone's light or dark setting.

The **?** beside the title opens **How it works**, which also appears the first time the app is opened.

## The log

**Save to log** stores the time, glucose, carbs, bolus, target, and an optional note. If you have a basal schedule, **With Basal** also records the basal dose for that time of day.

The **log** button opens one day at a time, with a graph of the day's glucose against your range and the entries in time order. Move between days with the arrows or the calendar. **+** adds an entry for a past time on the day you are viewing, with its own Dishes button. Remove an entry with its ×; **Undo** on the message that follows brings it back for a few seconds.

After a save, and the next time you open the app, glucose starts at the target of the newest log entry.

## Your routine

The settings button opens **Set your routine**:

- Glucose unit: mmol/L or mg/dL. In mg/dL readings are whole numbers.
- Target While Dosing Bolus, and the low and high ends of the target range.
- How much 10 g of carbs raises glucose, and how much 1 unit of insulin lowers it.
- Bolus Dosage Increment: 0.1, 0.5 or 1 unit, to match your pen or pump.
- Whether to subtract fibre.
- Daily Basal Dosages for morning (4am–10am), lunch (10am–4pm), dinner (4pm–10pm) and overnight (10pm–4am). Changing an amount keeps the earlier amounts for past days.
- **Reset Routine** puts the defaults back.

The defaults are a 4–8 mmol/L range, a 6 mmol/L target, 10 g of carbs raising glucose by 3 mmol/L, and 1 unit lowering it by 3 mmol/L, so 10 g is balanced by 1 unit.

## Your data

The routine, the log, and your dishes, with how often you pick each, are stored in this browser on this device only.

**Backup to file** saves all of it to a JSON file, and **Restore from file** replaces what is on the device with a backup, after saying what it holds. Backups made before dishes existed restore with no dishes. **Delete all data** clears the log and dishes and resets the routine.

## Install

On iPhone and iPad, tap Share, then Add to Home Screen; on a Mac in Safari, choose File, then Add to Dock. Other browsers offer an **Install** button. The installed app opens full screen, keeps to portrait, and asks you to turn the phone upright if it is held sideways.

## Develop

```bash
npm install
npm test
npm run dev
```

The app is TypeScript with Vite and no framework. In `src`:

| File | What it holds |
|---|---|
| `calculator.ts` | The dose and target maths |
| `format.ts`, `units.ts` | Wording for a dose and the glucose units |
| `log.ts` | Log entries, their storage and the recent bolus check |
| `basal.ts` | The basal schedule and its history |
| `dishes.ts` | Dishes, their storage, search and pick counts |
| `backup.ts` | Making and reading backup files |
| `day-graph.ts` | The day graph in the log |
| `text.ts`, `device.ts` | Text helpers, and Safari and iPhone detection |
| `views.ts` | Screens that slide in over each other |
| `dishes-view.ts`, `toast.ts`, `save-island.ts` | The Dishes screen, messages, and the sticky islands |
| `main.ts` | Wires the page together |

Logic lives in the small modules, each with a `*.test.ts` beside it; the screen code is checked in a browser.

## Publish on GitHub Pages

`npm install` installs the git hooks. The pre-commit hook runs `npm run build` and stages the `docs` folder, so a commit already contains the site GitHub Pages serves.

In the GitHub repo settings, open Pages and deploy from the `main` branch, folder `/docs`.

Asset URLs are relative, so the same build works at `https://<user>.github.io/<repo>/` and at the root of a user site or custom domain.

## Keeping this README current

Every commit that changes how the app behaves updates this README in the same commit. The commit-msg hook refuses a commit that changes the app (anything in `src` other than tests, `index.html`, `public`, or `vite.config.ts`) without `README.md`, unless the message has a line reading `README: no change needed`. Coding agents follow the same rule from [AGENTS.md](AGENTS.md).
