# Question Desk

A static personal tracker for the Markdown question archive in `../OA-questions`. It includes all generated question content, company and topic filters, solved status, personal notes, dark/light themes, portable progress backups, and private cross-device synchronization through Supabase.

## Local development

```bash
npm install
npm run data
npm run dev
```

`npm run data` reads the sibling `OA-questions/questions` directory and refreshes `src/data/questions.json`. Commit the generated JSON whenever the archive changes.

## GitHub Pages

1. Create a GitHub repository and push this folder to its default branch.
2. In the repository, open **Settings > Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main`, or run the **Deploy static site to Pages** workflow manually.

The site stores progress and notes in browser `localStorage`. Use **Export progress** and **Import progress** to transfer or back up that data without publishing private credentials.

## Progress synchronization

The app uses Supabase email magic-link authentication. Signed-in progress is stored in `public.question_progress`, protected by Row Level Security so each account can access only its own rows. Local storage remains available as an offline fallback and is merged into the account on first sign-in.

The Supabase project URL and publishable key in `src/lib/supabase.ts` are public browser credentials. Never add the database password or a service-role key to this repository.

After the first GitHub Pages deployment, add the deployed site address to **Supabase > Authentication > URL Configuration > Redirect URLs**. Set it as the Site URL as well if GitHub Pages is the primary deployment.