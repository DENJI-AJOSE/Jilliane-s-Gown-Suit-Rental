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

## 4. Secure the admin login

The admin panel now signs in with **Supabase Auth** instead of comparing a hardcoded username/password in frontend JavaScript.

1. In your Supabase dashboard, open **Authentication > Users**.
2. Create an admin user with an email address and password.
3. Use that email and password in the website's admin login modal.

The site keeps public read access for rentals, but only **authenticated** users can insert or delete rentals.

## 5. Update database policies

If you already created the `rentals` table using the older SQL, run the updated [supabase-schema.sql](C:\Github\jillianes-gown-suit-rental-website\Jilliane's Gown & Suit Rental\supabase-schema.sql) again or replace the old public write policies with authenticated-only policies.

Without that SQL update, visitors could still write to the rentals table with the public key.
