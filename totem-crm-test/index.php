<?php
declare(strict_types=1);

// REMOTE_USER is set by the web server AFTER directory authentication succeeds.
// Do not accept PHP_AUTH_USER or X-Remote-User: those can be supplied by a caller.
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Cache-Control: private, no-store, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('Content-Type: text/html; charset=utf-8');

$authenticatedUser = $_SERVER['REMOTE_USER'] ?? '';
if (!is_string($authenticatedUser) || $authenticatedUser === '') {
    http_response_code(403);
    echo 'Access denied.';
    exit;
}

// A forwarded header alone is not evidence of HTTPS from a trusted proxy.
$https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
if (!in_array($https, ['on', '1'], true) && (string)($_SERVER['SERVER_PORT'] ?? '') !== '443') {
    http_response_code(403);
    echo 'HTTPS is required.';
    exit;
}

$nonce = base64_encode(random_bytes(24));
header("Content-Security-Policy: default-src 'none'; style-src 'nonce-$nonce'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");

// Only a separately verified clone may be connected. No default live CRM URL.
// This file belongs ABOVE public_html, outside Git and the deployment folder.
$cloneUrl = '';
$documentRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
if ($documentRoot !== false) {
    $configPath = realpath(dirname($documentRoot) . '/private/totem-crm-test.php');
    if ($configPath !== false && is_file($configPath)
        && strpos($configPath, $documentRoot . DIRECTORY_SEPARATOR) !== 0) {
        try {
            $settings = require $configPath;
            $candidate = is_array($settings) ? ($settings['clone_url'] ?? '') : '';
            $parts = is_string($candidate) ? parse_url($candidate) : false;
            if (is_array($settings) && ($settings['access_verified'] ?? false) === true && is_array($parts)
                && ($parts['scheme'] ?? '') === 'https'
                && ($parts['host'] ?? '') === 'tmac.totemservices.org'
                && in_array($parts['port'] ?? 443, [443], true)
                && in_array($parts['path'] ?? '/', ['', '/'], true)
                && !isset($parts['user']) && !isset($parts['pass'])
                && !isset($parts['query']) && !isset($parts['fragment'])) {
                $cloneUrl = 'https://tmac.totemservices.org/';
            }
        } catch (Throwable $error) {
            // Configuration errors keep the launcher disabled; expose no path/details.
            $cloneUrl = '';
        }
    }
}
$ready = $cloneUrl !== '';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>Totem CRM | Private test access</title>
  <style nonce="<?= htmlspecialchars($nonce, ENT_QUOTES, 'UTF-8') ?>">
    :root{color-scheme:light;--ink:#172b3a;--muted:#566a77;--orange:#d35a23;--line:#dce4e8;--paper:#f3f6f7}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .wrap{max-width:1040px;margin:auto;padding:28px 24px 56px}header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:48px}
    .brand{font-weight:800;font-size:23px;letter-spacing:.05em;display:flex;align-items:center;gap:12px}.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--ink);color:white;font-size:20px}
    .private{font-size:12px;text-transform:uppercase;letter-spacing:.12em;border:1px solid var(--line);padding:7px 12px;border-radius:30px;background:white}.eyebrow{color:var(--orange);font-size:13px;font-weight:750;letter-spacing:.12em;text-transform:uppercase}
    h1{font-size:clamp(32px,5vw,52px);letter-spacing:-.04em;line-height:1.12;margin:14px 0 18px}p{margin:0 0 16px}.intro{max-width:680px;color:var(--muted);font-size:18px}.access{background:white;border:1px solid var(--line);border-radius:20px;padding:28px;margin:30px 0 36px}
    .status{display:inline-block;font-size:13px;font-weight:700;padding:4px 11px;border-radius:20px;background:<?= $ready ? '#e6f4ea' : '#fff0df' ?>;color:<?= $ready ? '#27643b' : '#87521b' ?>;margin-bottom:14px}
    h2{font-size:21px;line-height:1.35;margin:0 0 10px}h3{font-size:18px;margin:0 0 10px}.access p{color:var(--muted);max-width:720px}.button{display:inline-block;border:0;border-radius:9px;padding:12px 22px;font:700 15px/1.4 system-ui;text-decoration:none;background:var(--orange);color:white;margin-top:8px}
    .button:focus-visible,a:focus-visible{outline:3px solid #34769a;outline-offset:4px}.button:disabled{background:#e5e9ec;color:#647581;cursor:not-allowed}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.card{background:white;border:1px solid var(--line);border-radius:16px;padding:24px}.card p{color:var(--muted);font-size:15px;margin:0}.number{display:block;color:var(--orange);font-size:13px;font-weight:750;margin-bottom:16px}
    footer{margin-top:36px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}footer a{color:var(--ink)}@media(max-width:720px){.wrap{padding:20px 18px 40px}header{margin-bottom:36px}.private{font-size:10px}.cards{grid-template-columns:1fr}.access{padding:22px}.intro{font-size:16px}}
  </style>
</head>
<body>
<div class="wrap">
  <header><div class="brand"><span class="mark" aria-hidden="true">T</span>TOTEM</div><span class="private">Private test access</span></header>
  <main>
    <div class="eyebrow">Company operating system</div>
    <h1>Totem CRM test area</h1>
    <p class="intro">A private starting point for checking the Totem CRM clone. Use sample clients, employees and transactions when testing each process.</p>
    <section class="access" aria-labelledby="access-title">
      <span class="status"><?= $ready ? 'Clone configured' : 'Clone not connected yet' ?></span>
      <h2 id="access-title"><?= $ready ? 'Open the separate test CRM' : 'The test CRM is being prepared' ?></h2>
      <p><?= $ready ? 'Continue to the protected clone and sign in with a test account. Changes there belong to the test environment.' : 'This private entry page is ready. The full CRM will be available after its separate test environment is connected and access checks are completed.' ?></p>
      <?php if ($ready): ?>
      <a class="button" href="<?= htmlspecialchars($cloneUrl, ENT_QUOTES, 'UTF-8') ?>">Open test CRM</a>
      <?php else: ?>
      <button class="button" type="button" disabled>Open test CRM</button>
      <?php endif; ?>
    </section>
    <h2>Processes to check</h2>
    <div class="cards">
      <section class="card"><span class="number">01 / SALES</span><h3>Lead to client</h3><p>Check lead intake, qualification, deal stages, agreements and client onboarding.</p></section>
      <section class="card"><span class="number">02 / DELIVERY</span><h3>Plan to completion</h3><p>Check services, team assignments, milestones, tasks, QA, client approval and publishing.</p></section>
      <section class="card"><span class="number">03 / BUSINESS</span><h3>Results to next month</h3><p>Check campaign reports, invoices, payments, monthly planning and reviewed AI recommendations.</p></section>
    </div>
  </main>
  <footer>Restricted to authorized testers. <a href="/">Return to Totem Services</a></footer>
</div>
</body>
</html>
