# Insulin calculator

A personal progressive web app for carbohydrate and insulin doses. The build output is the `docs` folder, ready for GitHub Pages.

Default ratios:

- Glucose range: 4–8 mmol/L
- Target used for doses: 6 mmol/L
- 10 g of carbohydrate raises glucose by 3 mmol/L
- 1 unit of insulin lowers glucose by 3 mmol/L

With those ratios, 10 g of carbohydrate is balanced by 1 unit of insulin.

## What it suggests

The insulin result stays hidden until you change the glucose, carbohydrate, or fibre. Glucose is a whole number and one decimal place, each with up and down buttons. Switch between mmol/L and mg/dL under Configure your dosage ratios; the choice is saved with your ratios. The active unit shows beside the current glucose. In mg/dL the reading is a whole number. Fibre can show under carbohydrate and is taken off before the dose. Hide or show that field from Configure your dosage ratios.

- **Above the range, or a meal that would finish above the target:** insulin to reach the target.
- **Inside the range with 0 g, or a meal that already finishes inside the range:** 0 units.
- **Below the range:** 0 units, plus the grams of carbohydrate that would reach the target.

Change the ratios in **Configure your dosage ratios**. They are stored in local storage on this device.

**Dishes**, beside Carbs, keeps the dishes you eat often with their carbohydrate and fibre. Tap a dish to fill in both amounts. Add a dish with a name and its grams; the form starts with the amounts already entered, and saving a name you already have updates that dish. Remove a dish with its ×. Dishes are stored on this device.

**Backup to file** saves the routine, the log, and your dishes to a JSON file, and **Restore from file** brings them back. A backup made before dishes existed restores with no dishes.

**Save to log** stores the current time, the glucose, the carbohydrate, the insulin, and an optional note. **View log** opens one day at a time and shows each note. **Add an entry** in the log records a past reading, carbohydrate, insulin, and note for the day you are viewing, and you can remove an entry. After a save from the calculator, and the next time you open the app, glucose starts at the target from the newest log entry.

This applies the ratios you enter. It does not replace a diabetes care plan.

## Develop

```bash
npm install
npm test
npm run dev
```

## Publish on GitHub Pages

`npm install` installs a pre-commit hook that runs `npm run build` and stages the `docs` folder, so a commit already contains the site GitHub Pages serves.

In the GitHub repo settings, open Pages and deploy from the `main` branch, folder `/docs`.

Asset URLs are relative, so the same build works at `https://<user>.github.io/<repo>/` and at the root of a user site or custom domain.
