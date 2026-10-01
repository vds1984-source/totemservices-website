<?php
// Totem website contact form -> authenticated SMTP notification.
// Public-facing email remains info@totemservices.org.
// SMTP password is intentionally stored OUTSIDE public_html / GitHub.

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function totem_respond(int $code, string $message, array $errors = []): void {
    http_response_code($code);
    if (strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false) {
        header('Content-Type: application/json; charset=utf-8');
        $response = ['ok' => $code === 200, 'message' => $message];
        if ($errors) $response['errors'] = $errors;
        echo json_encode($response, JSON_UNESCAPED_UNICODE);
    } else {
        // Ordinary POST submissions also get a readable, private confirmation.
        header('Content-Type: text/html; charset=utf-8');
        $title = $code === 200 ? 'Enquiry received' : 'Please check your enquiry';
        echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' . $title . ' | Totem</title><link rel="stylesheet" href="/assets/style.css"></head><body><main class="section"><div class="wrap"><div class="card"><h1>' . $title . '</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p><a class="btn" href="/contact/">Contact Totem</a> <a class="btn2" href="https://wa.me/918278416000">WhatsApp Us</a></div></div></main></body></html>';
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    totem_respond(405, 'Please submit your enquiry using a website form.');
}

if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 32768) {
    totem_respond(413, 'Your enquiry is too large. Please shorten it and try again.');
}

function smtp_read_response($socket) {
    $response = '';
    while (($line = fgets($socket, 2048)) !== false) {
        $response .= $line;
        // SMTP multiline replies use "250-..." and finish with "250 ...".
        if (strlen($line) >= 4 && $line[3] === ' ') break;
    }
    return $response;
}

function smtp_expect($socket, $expectedCodes, $command = null) {
    if ($command !== null) {
        if (fwrite($socket, $command . "\r\n") === false) {
            throw new RuntimeException('SMTP write failed');
        }
    }
    $response = smtp_read_response($socket);
    $code = (int)substr($response, 0, 3);
    if (!in_array($code, (array)$expectedCodes, true)) {
        // Do not log credentials. Command labels only are supplied by caller.
        throw new RuntimeException('SMTP server returned code ' . $code . ': ' . trim($response));
    }
    return $response;
}

function smtp_send_mail($host, $port, $username, $password, $recipient, $replyTo, $subject, $body) {
    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'SNI_enabled' => true,
            'peer_name' => $host,
        ],
    ]);

    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client(
        'ssl://' . $host . ':' . $port,
        $errno,
        $errstr,
        20,
        STREAM_CLIENT_CONNECT,
        $context
    );

    if (!$socket) {
        throw new RuntimeException('Could not connect to SMTP server');
    }

    stream_set_timeout($socket, 20);

    try {
        smtp_expect($socket, [220]);

        $ehloHost = $_SERVER['SERVER_NAME'] ?? 'totemservices.org';
        smtp_expect($socket, [250], 'EHLO ' . preg_replace('/[^A-Za-z0-9.-]/', '', $ehloHost));

        smtp_expect($socket, [334], 'AUTH LOGIN');
        smtp_expect($socket, [334], base64_encode($username));
        smtp_expect($socket, [235], base64_encode($password));

        smtp_expect($socket, [250], 'MAIL FROM:<' . $username . '>');
        smtp_expect($socket, [250, 251], 'RCPT TO:<' . $recipient . '>');
        smtp_expect($socket, [354], 'DATA');

        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: Totem Website <' . $username . '>',
            'To: <' . $recipient . '>',
            'Subject: ' . $subject,
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@totemservices.org>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];

        if ($replyTo !== '') {
            $headers[] = 'Reply-To: ' . $replyTo;
        }

        $message = implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", str_replace("\r\n", "\n", $body));

        // SMTP dot-stuffing: lines beginning with a dot must be doubled.
        $message = preg_replace('/(^|\r\n)\./', '$1..', $message);

        if (fwrite($socket, $message . "\r\n.\r\n") === false) {
            throw new RuntimeException('SMTP message write failed');
        }
        smtp_expect($socket, [250]);

        // Best-effort QUIT. Delivery already succeeded if the DATA response was 250.
        @fwrite($socket, "QUIT\r\n");
        @smtp_read_response($socket);
    } finally {
        fclose($socket);
    }
}

// Honeypot: normal visitors never fill this field.
if (!empty($_POST['website'])) {
    totem_respond(200, 'Thank you. Your enquiry has been received.');
}

require_once __DIR__ . '/enquiry-validation.php';
$validation = totem_validate_enquiry($_POST, time());
if ($validation['errors']) {
    totem_respond(422, reset($validation['errors']), $validation['errors']);
}

if ($validation['too_fast']) {
    header('Retry-After: 2');
    totem_respond(429, 'Please wait a moment and try again.');
}

// Shared server-side limit for Contact, Consultation and Proposal.
require_once __DIR__ . '/enquiry-rate-limit.php';
try {
    $rateLimit = totem_limit_enquiry(
        $_SERVER['REMOTE_ADDR'] ?? '',
        time(),
        $_SERVER['DOCUMENT_ROOT'] ?? ''
    );
} catch (Throwable $e) {
    // Keep internal paths and storage errors out of the visitor response.
    error_log('Totem enquiry rate limit: ' . $e->getMessage());
    header('Retry-After: 60');
    totem_respond(503, 'Enquiry delivery is temporarily unavailable. Please contact us on WhatsApp.');
}
if (!$rateLimit['allowed']) {
    header('Retry-After: ' . $rateLimit['retry_after']);
    $waitMinutes = (int)ceil($rateLimit['retry_after'] / 60);
    $waitText = $waitMinutes === 1 ? '1 minute' : $waitMinutes . ' minutes';
    totem_respond(429, 'Too many enquiries have been submitted from this connection. Please wait ' . $waitText . ' and try again, or contact us on WhatsApp.');
}

$fields    = $validation['fields'];
$name      = $fields['Name'];
$business  = $fields['Business'];
$phone     = $fields['Phone'];
$email     = $fields['Email'];
$city      = $fields['City'];
$industry  = $fields['Industry'];
$service   = $fields['Service'];
$budget    = $fields['Budget'];
$challenge = $fields['Challenge'];
$formType  = $fields['FormType'];

$smtpHost = 'smtp.hostinger.com';
$smtpPort = 465;
$smtpUser = 'info@totemservices.org';
$recipient = 'totemmangement@gmail.com';

// Preferred: server environment variable. Fallback: private PHP file one level above public_html.
$smtpPassword = getenv('TOTEM_SMTP_PASSWORD') ?: '';
if ($smtpPassword === '') {
    $privateFile = dirname($_SERVER['DOCUMENT_ROOT']) . '/private/totem-mail-secret.php';
    if (is_file($privateFile)) {
        $secret = require $privateFile;
        if (is_array($secret) && isset($secret['password']) && is_string($secret['password'])) {
            $smtpPassword = $secret['password'];
        }
    }
}

if ($smtpPassword === '') {
    error_log('Totem contact form: SMTP password not configured');
    totem_respond(503, 'Enquiry delivery is temporarily unavailable. Please contact us on WhatsApp.');
}

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
    'Form: ' . $formType,
    'Source: ' . $validation['source_url'],
];
foreach (['source', 'medium', 'campaign', 'term', 'content'] as $key) {
    if ($fields['UTM_' . $key] !== '') $lines[] = 'UTM ' . $key . ': ' . $fields['UTM_' . $key];
}
$body = implode("\n", $lines);

try {
    smtp_send_mail($smtpHost, $smtpPort, $smtpUser, $smtpPassword, $recipient, $email, $subject, $body);
    totem_respond(200, 'Thank you. Your enquiry has been sent to the Totem team.');
} catch (Throwable $e) {
    // Never expose SMTP details to the visitor.
    error_log('Totem contact form SMTP error: ' . $e->getMessage());
    totem_respond(503, 'Enquiry delivery is temporarily unavailable. Please contact us on WhatsApp.');
}
