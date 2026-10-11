# The Fifth Table: blog and enquiries

The public site is static. Blog posts and admin access use this site's Netlify Functions and site-wide Netlify Blobs store, `thefifthtable-blog`. Project photos use a separate store, `thefifthtable-projects`, with the same admin account and session. Enquiries use this site's Netlify Forms. These features are independent of the SNS Coffee website.

## Local review

Run `npm run dev` and open `http://localhost:4173/`. The loopback-only preview runs the same blog and project API handlers against isolated local stores. Enquiry submission remains disabled.

- Gallery appearance: `http://localhost:4173/projects.html?preview=gallery`. Clearly labelled sample photography demonstrates the layout without adding fake projects to the real gallery.
- Photo manager: `http://localhost:4173/projects.html#admin`. Choose **Open local photo manager** to test upload and deletion. This development-only session endpoint exists only in `scripts/preview.mjs`; it is not part of the deployed Functions.
- Local photos persist in `.local-preview-data/projects`, which is ignored by Git and excluded from the website build. Later local edits are not synchronized to the live site. Local blog edits are held in memory for the preview session.
- The sample view does not modify the real gallery. Use **View your gallery** to see actual uploads. The local gallery now contains 13 owner-supplied photographs from Downloads. Three introductory stock photographs are labelled as hospitality inspiration: the original cover, the selected quiet café corner and the selected sunlit rattan scene. Each opens in the photo viewer. Four stock options can be compared at `projects.html?preview=ideas`; options 02 and 03 are the selected additions.

Run `npm ci`, `npm test` and `npm run build` with Node 22.12 or later. The build output is `dist`. Netlify builds the API separately from `netlify/functions`; these server files, tests, dependencies and setup documentation are not copied into the public output.

Both tests and builds first bundle the pinned, current HTML sanitizer and its parser into `netlify/generated/sanitize-html.cjs`. AWS Lambda disables loading ES modules with `require()`, even on modern Node runtimes; the private bundle avoids that incompatibility without downgrading security fixes or enabling experimental flags. Tests run with Lambda's disabled-feature flags. The generated file is ignored by Git and excluded from the public `dist` directory, but included through the function's server-side import when Netlify packages it.

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

## Project photo administration

Open `projects.html` and choose **Admin · Manage photos**, or use **Manage project photos** in Blog Admin. Sign in with the existing blog password. No additional setup key, account, or password is needed when blog administration is already configured.

Choose up to 12 JPG, PNG or WebP files at a time, review the thumbnails, and select **Upload photos**. Input files can be up to 20 MB; the browser resizes to at most 2400 pixels on the longest edge and encodes a JPEG of at most 2 MB before upload. Original filenames and image metadata are not saved. The server validates the format, dimensions, request origin and admin session, then persists the photo and gallery index in the site-wide project store. Concurrent updates use conditional writes.

Photos appear without names or captions in a two-column gallery, or a single column on mobile. Visitors can enlarge images and browse with arrows. The four newest also appear on the homepage. The admin can delete a photo after confirming in the manager; it disappears from both gallery listings and cannot be fetched through the image endpoint afterward. The public gallery refreshes on page load; the admin sees changes immediately.

Deploy the new `projects` Function with the static pages to activate live uploads. Uploaded live photos persist across subsequent deployments; no rebuild is needed to add or remove photographs. Back up the `thefifthtable-projects` store before removing a Netlify project. The old static `data/project-photos.json` manifest is no longer the source for the gallery.

## Content and backups

`data/blog-posts.js` contains the 19 initial published articles and is also the local preview fallback. These were exported with a read-only request, independently copied, rebranded, and sanitized; publication dates were normalized without changing the calendar dates. On the first authenticated write, initial posts are copied into this site's store. Later edits and deletions live in Blobs and persist across deployments. Back up the **posts** entry from Netlify's Blobs dashboard before changing or deleting the project. Do not publish a Blobs export containing admin or session records.

If the blog password is forgotten, the Netlify project owner can delete only the **admin** entry in the `thefifthtable-blog` store, set a fresh **BLOG_SETUP_KEY**, redeploy, and repeat first setup. Posts are a separate entry; leave them intact. The old sessions become invalid when the admin record is removed.

## Deployment checks

- Confirm the live blog API returns public posts and denies unauthenticated edits.
- Set up the owner account directly in the browser, then verify sign-in and draft creation from another session.
- Send one clearly labelled test enquiry, confirm it in the site's Forms dashboard, and confirm the email notification.
- Check the deployment logs for successful API rate-limit configuration.

Reference: [Netlify Forms](https://docs.netlify.com/manage/forms/setup/), [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), [Function rate limits](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).

## Approved initial project photo import

`migration/project-photos` contains the 13 approved JPEGs and their gallery order, copied from the reviewed local gallery. It is included in the private project function package, not in the static public directory. On the first request, the project function imports the photos only if the live gallery index has never been created. It publishes the index after all images are stored. Existing galleries, including an empty gallery after admin deletions, are never replaced. The import can be retried safely after a temporary storage failure. Later uploads and deletions remain independent of this snapshot and survive redeployment.
