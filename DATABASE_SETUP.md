# Database Setup

This site was changed from `localStorage` to a hosted Supabase database because the project is a static HTML/CSS/JS website and there is no local backend runtime installed in this workspace.

## 1. Create a Supabase project

1. Open [https://supabase.com/](https://supabase.com/).
2. Create a new project.
3. Open the SQL editor.
4. Paste the contents of [supabase-schema.sql](C:\Users\RCS\OneDrive\Documents\Jilliane's Gown & Suit Rental Website\supabase-schema.sql) and run it.

## 2. Add your project keys

1. Open your Supabase project settings.
2. Copy the project URL.
3. Copy the anon public key.
4. Edit [db-config.js](C:\Users\RCS\OneDrive\Documents\Jilliane's Gown & Suit Rental Website\db-config.js):

```js
window.DB_CONFIG = {
    supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
    supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};
```

You can use [db-config.example.js](C:\Users\RCS\OneDrive\Documents\Jilliane's Gown & Suit Rental Website\db-config.example.js) as a reference.

## 3. What changed

- `script.js` now loads rentals from Supabase instead of `localStorage`.
- New rentals are inserted through the Supabase REST API.
- Removed rentals are deleted from the database.
- Old browser-only rental data is migrated once from `localStorage` into the database when `db-config.js` is filled in.

## 4. Important security note

The current admin login in [script.js](C:\Users\RCS\OneDrive\Documents\Jilliane's Gown & Suit Rental Website\script.js) is still hardcoded in frontend JavaScript. That means it is not secure, even though the data now lives in a real database.

For a proper production setup, the next step is:

- move admin authentication to a backend or Supabase Auth
- stop exposing write access directly from the browser
- replace the hardcoded username/password with server-side login
