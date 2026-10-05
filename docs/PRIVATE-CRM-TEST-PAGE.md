# D1 — protected Totem CRM test entry page

Proposed address: `https://totemservices.org/totem-crm-test/`.

This is the private **entry page**, not an installation of the full CRM. The current website is HTML/PHP; the CRM needs its own Next.js process, Node API and PostgreSQL database. A hidden link, iframe or static copy would not supply those services. The separate clone at `tmac.totemservices.org` remains unprovisioned/unverified by this work.

## Protection and deployment behavior

- Adds a new page folder, tests/docs and a Git ignore rule for the server-managed authentication file. No public navigation, sitemap, robots file, main website server configuration or live CRM file is changed.
- The PHP page denies access by default and requires the web server's authenticated `REMOTE_USER`; Basic credentials, forwarded-user headers or a hidden URL alone cannot unlock it. If directory authentication is missing or `.htaccess` is ignored, PHP stays closed. The page folder contains only `index.php`; store no other files/data there before hPanel directory protection is activated.
- HTTPS is required. A forwarded-protocol header alone is not trusted. Responses request no caching/indexing and disallow framing; there are no external assets, JavaScript or stored credentials.
- hPanel's native directory protection manages usernames/passwords on the server. Do not protect `public_html` itself: that would lock the public website. Do not store passwords in GitHub or this folder.
- The launch button stays disabled until a private server file explicitly confirms the configured clone's access was verified. Only the exact HTTPS clone hostname is accepted; live CRM/main-domain URLs, credentials in URLs, other ports and redirects supplied in query parameters are rejected.
- Opening this page does **not** secure a separate clone origin. Before enabling its button, separately protect every clone frontend route, API, upload, callback and direct origin. Test anonymous requests, not just the CRM login page. Keep original authorization/privacy corrections as separate requirements.

## Manual activation after review

1. Merge the reviewed page PR and let the website's existing Git deployment add the new folder. Its PHP entry page is closed by default. Confirm the new path returns 403 and the public homepage still opens.
2. In hPanel, open **Websites → totemservices.org → Dashboard → Password Protect Directories**. Select **only `public_html/totem-crm-test`**. Create a unique test-area username and strong password, then select **Protect**. Keep the credentials in your password manager.
3. Inspect this folder's server-generated `.htaccess` in File Manager. It must contain `AuthType Basic`, `AuthUserFile` and `Require valid-user`; preserve these lines. The file is ignored by Git and is not shipped in this change, so normal Git updates do not replace hPanel's credentials/configuration. Never replace the root website `.htaccess`. If the username prompt does not appear or the page stays closed, preserve protection and report the response; do not remove the PHP guard.
4. In a new private browser window, the folder and `index.php` must challenge/reject anonymous and wrong-password access. Correct credentials over HTTPS must open the page; refresh must preserve access; the response must have `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. The homepage must still work without credentials. If server `REMOTE_USER`/HTTPS metadata is absent, access remains denied until that provider behavior is verified.
5. The initial page will honestly show **Clone not connected yet**. Provision a separate clone runtime/database/storage with synthetic data and new secrets. Do not use production KVM 4, production database URLs, mail credentials, ad credentials or real employee/client records. Keep SMTP, external AI calls, Meta publishing and workers disabled until explicitly tested/configured.
6. Once the clone is separately working and its direct frontend/API/storage access has passed privacy checks, create `private/totem-crm-test.php` **one level above `public_html`**, outside Git/web access, using the following non-secret configuration. The already verified clone domain is the only allowed target.

```php
<?php
return [
    'clone_url' => 'https://tmac.totemservices.org/',
    'access_verified' => true,
];
```

Do not set `access_verified` to true before the separate clone access checks pass. The flag records the administrator's verification; the portal does not certify the remote server. No sample production credentials or automatic database migration/seed commands are included.

## Automated check

`python3 scripts/test-private-crm-page.py` runs the actual PHP page under a temporary loopback Apache configuration with synthetic directory credentials. It checks the default denial, valid/invalid authentication, forged user headers, direct files, missing directory overrides, HTTPS metadata, disabled launcher and URL allowlist/private configuration. The test creates no production connection. The GitHub workflow installs the required Apache/PHP fixture packages on its disposable runner.

## Rollback

Disable/remove the outside-webroot launcher configuration or add `Require all denied` in this folder's server-managed `.htaccess` to close the test page. The public website and live CRM do not require this folder. Keep a server-side backup of hPanel's authentication configuration outside Git, and after every deployment verify protection again. The ignore rule supports ordinary Git updates; a deploy that force-cleans ignored files or replaces the whole webroot still needs provider verification. The PHP guard denies access if the directory configuration disappears.

## References

- [Hostinger directory protection](https://www.hostinger.com/support/1583470-how-to-password-protect-a-website-in-hostinger/)
- [Apache authentication and authorization](https://httpd.apache.org/docs/2.4/howto/auth.html)
- [Next.js static export limitations](https://nextjs.org/docs/app/guides/static-exports)
