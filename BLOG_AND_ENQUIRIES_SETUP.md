# The Fifth Table: blog and enquiries

The public site is static. Blog posts and admin access use this site's Netlify Functions and site-wide Netlify Blobs store, `thefifthtable-blog`. Enquiries use this site's Netlify Forms. Neither feature depends on another website's account, database or Google Apps Script.

## Local review

Serve the repository with an HTTP server and open `blogs.html`. Published articles bundled in `data/blog-posts.js` render locally. Blog administration and enquiry submission show a clear preview notice until hosting is connected; the preview never claims to publish or submit data.

Run `npm ci`, `npm test` and `npm run build` with Node 22 or later. The build output is `dist`. Netlify builds the API separately from `netlify/functions`; these server files, tests, dependencies and setup documentation are not copied into the public output.

## Deploy to the owner's Netlify project

1. Use the new Netlify account belonging to `thisvishnurajnair@gmail.com` and its own GitHub repository.
2. Keep the Free plan. Functions, Blobs and hosting consume the account's included usage; inspect the current plan's limits in Netlify before deployment. Do not enable paid usage automatically.
3. Use the repository's `netlify.toml`: `npm run build`, publish directory `dist`, functions directory `netlify/functions`.
4. Enable Netlify Forms detection before deploying. The static form is named **enquiry**, with a honeypot field.
5. In Netlify's Forms notification settings, configure enquiry email notifications to **thisvishnurajnair@gmail.com**. Accepted enquiries are also available in that project's Forms dashboard.

## First blog admin setup

1. Privately generate a random setup key of at least 32 characters and add it as the Netlify environment variable **BLOG_SETUP_KEY**, available to Functions. Never commit the key to GitHub or paste it in chat.
2. Deploy the project, open `https://thefifthtable.in/blogs.html`, and choose **Admin**.
3. The owner enters the setup key and chooses a new password of at least 12 characters directly in the browser. This password is separate from the owner's Google, GitHub and Netlify passwords.
4. Setup can run only once and only with the correct key. Remove the **BLOG_SETUP_KEY** environment variable after successful setup and redeploy.
5. On another device, open **Admin**, then sign in with the same blog password. Drafts, published posts, editing and deletion all use the shared store. No passwords or drafts are kept in browser localStorage.

Sessions use secure, HTTP-only cookies and expire after eight hours. Password changes sign out other sessions. The API rate-limits repeated sign-in attempts, checks request origins, and sanitizes rich text before saving it. The blog account label is `thisvishnurajnair@gmail.com`; this is a separate website admin login, not Google single sign-on.

## Content and backups

`data/blog-posts.js` contains the 19 initial published articles and is also the local preview fallback. These were exported with a read-only request, independently copied, rebranded, and sanitized; publication dates were normalized without changing the calendar dates. On the first authenticated write, initial posts are copied into this site's store. Later edits and deletions live in Blobs and persist across deployments. Back up the **posts** entry from Netlify's Blobs dashboard before changing or deleting the project. Do not publish a Blobs export containing admin or session records.

If the blog password is forgotten, the Netlify project owner can delete only the **admin** entry in the `thefifthtable-blog` store, set a fresh **BLOG_SETUP_KEY**, redeploy, and repeat first setup. Posts are a separate entry; leave them intact. The old sessions become invalid when the admin record is removed.

## Deployment checks

- Confirm the live blog API returns public posts and denies unauthenticated edits.
- Set up the owner account directly in the browser, then verify sign-in and draft creation from another session.
- Send one clearly labelled test enquiry, confirm it in the site's Forms dashboard, and confirm the email notification.
- Check the deployment logs for successful API rate-limit configuration.

Reference: [Netlify Forms](https://docs.netlify.com/manage/forms/setup/), [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), [Function rate limits](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).
