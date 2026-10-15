<?php
// Read-only private enquiry feed. Bearer credentials remain in server configuration.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow, noarchive');
function totem_feed_respond(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    totem_feed_respond(405, ['error' => 'Method not allowed.']);
}
require_once __DIR__ . '/enquiry-outbox.php';
try {
    $outboxSettings = totem_outbox_settings($_SERVER['DOCUMENT_ROOT'] ?? '');
} catch (Throwable $error) {
    totem_feed_respond(503, ['error' => 'Feed unavailable.']);
}
if (!$outboxSettings['enabled']) totem_feed_respond(404, ['error' => 'Not found.']);
$secret = $outboxSettings['feedToken'];
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!is_string($authorization) || !preg_match('/^Bearer ([A-Za-z0-9_-]{32,128})$/D', $authorization, $match)
    || !hash_equals($secret, $match[1])) {
    header('WWW-Authenticate: Bearer');
    totem_feed_respond(401, ['error' => 'Authentication required.']);
}
foreach (array_keys($_GET) as $key) {
    if (!in_array($key, ['limit', 'cursor'], true)) totem_feed_respond(400, ['error' => 'Invalid feed pagination.']);
}
$limit = $_GET['limit'] ?? '20';
$cursor = $_GET['cursor'] ?? null;
if (!is_string($limit) || !preg_match('/^(?:[1-9]|1[0-9]|20)$/D', $limit)
    || ($cursor !== null && !is_string($cursor))) {
    totem_feed_respond(400, ['error' => 'Invalid feed pagination.']);
}
try {
    $response = totem_outbox_feed($_SERVER['DOCUMENT_ROOT'] ?? '', (int)$limit, $cursor);
    totem_feed_respond(200, $response);
} catch (TotemOutboxInput $error) {
    totem_feed_respond(400, ['error' => 'Invalid feed pagination.']);
} catch (Throwable $error) {
    // No exception details, paths, enquiry contents or credentials are logged.
    totem_feed_respond(503, ['error' => 'Feed unavailable.']);
}

