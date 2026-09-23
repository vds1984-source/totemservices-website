<?php
// Totem website contact form -> authenticated SMTP notification.
// Public-facing email remains info@totemservices.org.
// SMTP password is intentionally stored OUTSIDE public_html / GitHub.

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
    http_response_code(503);
    echo json_encode(['ok' => false, 'message' => 'Email delivery is temporarily unavailable.']);
    exit;
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
    'Source: https://totemservices.org/contact/'
];
$body = implode("\n", $lines);

try {
    smtp_send_mail($smtpHost, $smtpPort, $smtpUser, $smtpPassword, $recipient, $email, $subject, $body);
    echo json_encode(['ok' => true]);
} catch (Throwable $e) {
    // Never expose SMTP details to the visitor.
    error_log('Totem contact form SMTP error: ' . $e->getMessage());
    http_response_code(503);
    echo json_encode(['ok' => false, 'message' => 'Email delivery is temporarily unavailable.']);
}
