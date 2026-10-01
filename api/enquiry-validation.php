<?php
// Shared, side-effect-free validation for website enquiries.
// This file neither sends notifications nor writes CRM records.

function totem_validate_enquiry(array $post, int $now): array {
    $limits = [
        'Name' => 100, 'Business' => 120, 'Phone' => 30, 'Email' => 160,
        'City' => 100, 'Industry' => 120, 'Service' => 120, 'Budget' => 80,
        'Challenge' => 2000, 'FormType' => 30,
        'UTM_source' => 200, 'UTM_medium' => 200, 'UTM_campaign' => 200,
        'UTM_term' => 200, 'UTM_content' => 200,
    ];
    $fields = [];
    $errors = [];

    foreach ($limits as $key => $limit) {
        $value = $post[$key] ?? ($key === 'FormType' ? 'contact' : '');
        if (!is_string($value) || !preg_match('//u', $value)) {
            $errors[$key] = 'Please enter a valid ' . strtolower($key) . '.';
            $fields[$key] = '';
            continue;
        }
        $value = str_replace(["\r\n", "\r"], "\n", $value);
        // Reject control characters before trimming, including in email headers.
        $controlPattern = $key === 'Challenge' ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/' : '/[\x00-\x1F\x7F]/';
        if (preg_match($controlPattern, $value)) {
            $errors[$key] = 'Please remove invalid characters from ' . strtolower($key) . '.';
        }
        $value = trim($value);
        $length = preg_match_all('/./us', $value);
        if ($length > $limit) {
            $errors[$key] = $key . ' must be no more than ' . $limit . ' characters.';
        }
        $fields[$key] = $value;
    }

    $sources = [
        'contact' => 'https://totemservices.org/contact/',
        'consultation' => 'https://totemservices.org/book-consultation/',
        'proposal' => 'https://totemservices.org/request-proposal/',
    ];
    if (!isset($sources[$fields['FormType']])) {
        $errors['FormType'] = 'Please use one of the website enquiry forms.';
    }

    $required = ['Name', 'Business', 'Phone'];
    if ($fields['FormType'] === 'proposal') {
        $required = array_merge($required, ['Email', 'City', 'Industry', 'Service', 'Budget', 'Challenge']);
    }
    foreach ($required as $key) {
        if ($fields[$key] === '') $errors[$key] = 'Please complete ' . strtolower($key) . '.';
    }

    if ($fields['Phone'] !== '') {
        $digits = preg_replace('/\D/', '', $fields['Phone']);
        if (!preg_match('/^\+?[0-9 ().-]+$/', $fields['Phone']) || strlen($digits) < 7 || strlen($digits) > 15) {
            $errors['Phone'] = 'Please enter a valid phone number with 7 to 15 digits.';
        }
    }
    if ($fields['Email'] !== '' && !filter_var($fields['Email'], FILTER_VALIDATE_EMAIL)) {
        $errors['Email'] = 'Please enter a valid email address.';
    }
    $budgets = ['Below ₹12K', '₹12K–₹25K', '₹25K–₹50K', '₹50K–₹1L', '₹1L–₹2L', '₹2L+'];
    if ($fields['Budget'] !== '' && !in_array($fields['Budget'], $budgets, true)) {
        $errors['Budget'] = 'Please select a marketing budget from the list.';
    }

    $started = $post['started_at'] ?? '';
    $tooFast = false;
    if ($started !== '') {
        if (!is_string($started) || !preg_match('/^[0-9]{1,12}$/', $started)) {
            $errors['started_at'] = 'Please reload the form and try again.';
        } else {
            $elapsed = $now - (int)$started;
            // Client timestamps are only a heuristic. Ignore future client clocks.
            $tooFast = (int)$started > 0 && $elapsed >= 0 && $elapsed < 2;
        }
    }

    return [
        'fields' => $fields, 'errors' => $errors, 'too_fast' => $tooFast,
        'source_url' => $sources[$fields['FormType']] ?? $sources['contact'],
    ];
}
