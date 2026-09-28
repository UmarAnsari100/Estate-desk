# IDEAS Group property import

The importer reads published pricing tables from the supplied IDEAS Group website repository. It extracts the 17 complete apartment price rows into the dashboard and records the 6 commercial per-square-foot figures in `ideasgroup-import-report.json`.

The website is not an inventory database and does not say which individual units are available. New and changed properties therefore enter the dashboard as **Inactive** with **Review required**. An administrator must verify a unit and set it to **Available** before the WhatsApp assistant can recommend it.

```powershell
npm run import:ideasgroup
npm run import:ideasgroup -- --apply
```

The first command is a dry run and refreshes the report. The second writes to the active database, so `npm run dev` must be running. Re-running the import updates sourced facts by stable property code, preserves the status of unchanged reviewed records, returns changed records to review, and deactivates source records removed from the website.

Commercial rates remain reference data because the website supplies rates per square foot without individual shop sizes or total prices. Importing them as ordinary properties would cause incorrect budget matching.
