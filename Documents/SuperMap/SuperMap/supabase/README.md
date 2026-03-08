# Supabase setup (login + saved articles)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).

2. In the Supabase dashboard, go to **SQL Editor** and run:
   - `migrations/001_saved_articles.sql`
   - `migrations/002_saved_x_posts_and_user_updates.sql`
   - `migrations/003_saved_places_and_delete_account.sql`
   - `migrations/004_saved_place_lists.sql`

   These create `saved_articles`, `saved_x_posts`, `user_updates`, `saved_places`, and `saved_place_lists` with Row Level Security so users only access their own saved content and authenticated users can read/post forum updates. They also add `delete_my_account()` for full user-data wipe + auth account deletion.

3. In **Project Settings → API**, copy:
   - **Project URL** → use as `VITE_SUPABASE_URL`
   - **anon public** key → use as `VITE_SUPABASE_ANON_KEY`

4. In the SuperMap folder, copy `.env.example` to `.env` (if you don’t have one) and add:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

5. Restart the app. You’ll see **Sign in** in the header; after sign-up/sign-in you can:
   - Save articles and X posts under **Saved**
   - Post in **Updates** (forum-style user updates)
   - Pin X posts from **OSINT (X)** into **Report Maker**

Places, lists, and drawings can use more Supabase tables later (e.g. `saved_places`, `saved_lists`, `saved_drawings`).
