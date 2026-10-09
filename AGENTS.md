# Working on Dosage Helper

A personal insulin and carbohydrate dose calculator, installed as a web app on a phone. Read [README.md](README.md) first: it describes what the app does and where the code lives.

## Commands

```bash
npm test        # vitest, for the logic modules
npm run build   # type-check and build into docs/
npm run dev     # local server for checking screens in a browser
```

## Before every commit

1. **Update README.md.** If the commit changes anything a person using the app would notice, or changes where code lives, edit the README so it describes the app after this commit, using the names shown on screen. Stage it in the same commit.
2. If nothing in the README needs to change, for example a refactor or a test-only change, add this line to the commit message:

   ```
   README: no change needed
   ```

   The commit-msg hook (`.githooks/commit-msg`) refuses a commit that changes the app without `README.md` or that line.
3. Run `npm test`. The pre-commit hook builds the site and stages `docs/`, so do not edit `docs/` by hand.

## Conventions

- Logic goes in a small module under `src/` with a `*.test.ts` beside it; `main.ts` only wires the page together. Screen behaviour is checked in a browser at phone width.
- Wording in the app and the README is plain English in the second person, and uses the labels shown on screen.
- This is a health tool. Do not change how a dose is calculated unless asked, and say so plainly when a change touches the dose maths.
