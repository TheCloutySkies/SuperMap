# Supabase setup (login + saved articles)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).

2. In the Supabase dashboard, go to **SQL Editor** and run:
   - `migrations/001_saved_articles.sql`
   - `migrations/002_saved_x_posts_and_user_updates.sql`
   - `migrations/003_saved_places_and_delete_account.sql`
   - `migrations/004_saved_place_lists.sql`
   - `migrations/005_saved_reports.sql`
   - `migrations/006_update_delete_account_for_reports.sql`
   - `migrations/007_forum_system.sql`

   These create `saved_articles`, `saved_x_posts`, `user_updates`, `saved_places`, `saved_place_lists`, `saved_reports`, and forum tables (`forum_categories`, `forum_communities`, `forum_posts`, `forum_comments`, `post_saved_links`, `category_requests`, `user_profiles`) with Row Level Security so users only access their own saved content and authenticated users can post forum content. They also add `delete_my_account()` for full user-data wipe + auth account deletion.

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
   - Save reports to account from **Report Maker**
   - Pin X posts from **OSINT (X)** into **Report Maker**
   - Use **Community** to create communities/posts/comments and request new categories

6. For profile pictures, create a Supabase Storage bucket named `avatars` (public is easiest). Client-side upload already enforces max 200KB and jpg/png/webp.
