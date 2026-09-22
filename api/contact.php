<?php
// Totem website contact form -> internal email notification.
// Public-facing email remains info@totemservices.org; submissions are delivered to the internal Gmail inbox below.
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method not allowed']);
    exit;
}

function clean_value($value, $max = 500) {
    $value = is_string($value) ? trim($value) : '';
    $value = str_replace(["\r", "\0"], '', $value);
    if (function_exists('mb_substr')) return mb_substr($value, 0, $max);
    return substr($value, 0, $max);
}

// Honeypot: normal visitors never fill this field.
if (!empty($_POST['website'])) {
    echo json_encode(['ok' => true]);
    exit;
}

$name      = clean_value($_POST['Name'] ?? '', 100);
$business  = clean_value($_POST['Business'] ?? '', 120);
$phone     = clean_value($_POST['Phone'] ?? '', 40);
$email     = clean_value($_POST['Email'] ?? '', 160);
$city      = clean_value($_POST['City'] ?? '', 100);
$industry  = clean_value($_POST['Industry'] ?? '', 120);
$service   = clean_value($_POST['Service'] ?? '', 120);
$budget    = clean_value($_POST['Budget'] ?? '', 80);
$challenge = clean_value($_POST['Challenge'] ?? '', 2000);
$startedAt = (int)($_POST['started_at'] ?? 0);

if ($name === '' || $business === '' || $phone === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Please complete name, business and phone.']);
    exit;
}

if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Please enter a valid email address.']);
    exit;
}

// Basic bot-speed check. Allow submissions when JS is unavailable and timestamp is absent.
if ($startedAt > 0 && (time() - $startedAt) < 2) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'message' => 'Please wait a moment and try again.']);
    exit;
}

$recipient = 'totemmangement@gmail.com';
$subjectBusiness = preg_replace('/[^A-Za-z0-9 .&()_-]/', '', $business ?: $name);
$subject = 'New Website Enquiry - ' . ($subjectBusiness ?: 'Totem Services');

$lines = [
    'New enquiry from totemservices.org',
    '----------------------------------',
    'Name: ' . $name,
    'Business: ' . $business,
    'Phone / WhatsApp: ' . $phone,
    'Email: ' . ($email ?: 'Not provided'),
    'City: ' . ($city ?: 'Not provided'),
    'Industry: ' . ($industry ?: 'Not provided'),
    'Interested Service: ' . ($service ?: 'Not provided'),
    'Marketing Budget: ' . ($budget ?: 'Not provided'),
    '',
    'Challenge / Goal:',
    ($challenge ?: 'Not provided'),
    '',
    'Submitted: ' . date('c'),
    'IP: ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
    'Source: https://totemservices.org/contact/'
];
$body = implode("\n", $lines);

$headers = [
    'From: Totem Website <info@totemservices.org>',
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PHP/' . phpversion()
];
if ($email !== '') {
    // Sanitized via FILTER_VALIDATE_EMAIL; safe to use as Reply-To.
    $headers[] = 'Reply-To: ' . $email;
}

$sent = @mail($recipient, $subject, $body, implode("\r\n", $headers));
if (!$sent) {
    error_log('Totem contact form: PHP mail() returned false');
    http_response_code(503);
    echo json_encode(['ok' => false, 'message' => 'Email delivery is temporarily unavailable.']);
    exit;
}

echo json_encode(['ok' => true]);
