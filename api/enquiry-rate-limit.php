<?php
// Persistent rolling limits shared by the three public enquiry forms.
// Stores only hashed IP keys and timestamps, outside the public website root.

function totem_limit_enquiry(string $clientIp, int $now, string $documentRoot): array {
    // REMOTE_ADDR comes from the server; forwarded headers are not trusted here.
    $address = @inet_pton($clientIp);
    if ($address === false || $now < 0) {
        throw new RuntimeException('Client address or server time is unavailable');
    }
    // IPv4 and IPv4-mapped IPv6 must share the same bucket.
    if (strlen($address) === 16 && substr($address, 0, 12) === str_repeat("\0", 10) . "\xff\xff") {
        $address = substr($address, 12);
    }
    $clientKey = hash('sha256', $address);

    if ($documentRoot === '') {
        throw new RuntimeException('Website document root is unavailable');
    }
    $root = realpath($documentRoot);
    if ($root === false || $root === dirname($root)) {
        throw new RuntimeException('Website document root is unavailable');
    }
    $directory = dirname($root) . '/private/totem-enquiry-limits';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Private rate-limit directory cannot be created');
    }
    $directory = realpath($directory);
    if ($directory === false || $directory === $root || strpos($directory . DIRECTORY_SEPARATOR, $root . DIRECTORY_SEPARATOR) === 0) {
        throw new RuntimeException('Rate-limit storage must be outside the public website');
    }
    if (!@chmod($directory, 0700)) {
        throw new RuntimeException('Private rate-limit permissions cannot be set');
    }

    // The separate lock survives atomic replacement of the counter file.
    $lockPath = $directory . '/enquiries.lock';
    $lock = @fopen($lockPath, 'c+b');
    if ($lock === false) {
        throw new RuntimeException('Rate-limit lock cannot be opened');
    }
    $temporary = null;
    try {
        if (!@chmod($lockPath, 0600) || !@flock($lock, LOCK_EX)) {
            throw new RuntimeException('Rate-limit lock cannot be acquired');
        }
        $stateFile = $directory . '/enquiries.json';
        $clients = [];
        if (is_file($stateFile)) {
            // Bound memory even if the file is damaged or unexpectedly large.
            $raw = @file_get_contents($stateFile, false, null, 0, 1048577);
            if ($raw === false || strlen($raw) > 1048576) {
                throw new RuntimeException('Rate-limit counters cannot be read');
            }
            $clients = json_decode($raw, true);
            if (!is_array($clients) || json_last_error() !== JSON_ERROR_NONE || count($clients) > 2048) {
                throw new RuntimeException('Rate-limit counters are invalid');
            }
        }

        // Remove expired clients on every accepted request; no cleanup job is needed.
        foreach ($clients as $key => $timestamps) {
            if (!is_string($key) || !preg_match('/^[a-f0-9]{64}$/', $key) || !is_array($timestamps) || count($timestamps) > 20) {
                throw new RuntimeException('Rate-limit counter format is invalid');
            }
            $active = [];
            foreach ($timestamps as $timestamp) {
                if (!is_int($timestamp) || $timestamp < 0) {
                    throw new RuntimeException('Rate-limit timestamp is invalid');
                }
                // A backwards server-clock adjustment cannot clear existing limits.
                $timestamp = min($timestamp, $now);
                if ($timestamp > $now - 3600) $active[] = $timestamp;
            }
            sort($active, SORT_NUMERIC);
            if ($active) $clients[$key] = $active;
            else unset($clients[$key]);
        }

        $timestamps = $clients[$clientKey] ?? [];
        $recent = array_values(array_filter($timestamps, function ($timestamp) use ($now) {
            return $timestamp > $now - 600;
        }));
        $retryAfter = 0;
        if (count($recent) >= 5) {
            $retryAfter = $recent[count($recent) - 5] + 600 - $now;
        }
        if (count($timestamps) >= 20) {
            $retryAfter = max($retryAfter, $timestamps[count($timestamps) - 20] + 3600 - $now);
        }
        if ($retryAfter > 0) {
            // Blocked attempts do not extend the visitor's wait.
            return ['allowed' => false, 'retry_after' => $retryAfter];
        }

        if (!isset($clients[$clientKey]) && count($clients) >= 2048) {
            throw new RuntimeException('Rate-limit storage is at capacity');
        }
        $timestamps[] = $now;
        $clients[$clientKey] = $timestamps;
        $encoded = json_encode($clients);
        if ($encoded === false) {
            throw new RuntimeException('Rate-limit counters cannot be encoded');
        }
        $encoded .= "\n";

        // A failed write keeps the previous state intact, rather than resetting quotas.
        $temporary = @tempnam($directory, '.limits-');
        if ($temporary === false || realpath(dirname($temporary)) !== $directory) {
            throw new RuntimeException('Private rate-limit update cannot be created');
        }
        if (!@chmod($temporary, 0600) || @file_put_contents($temporary, $encoded) !== strlen($encoded) || !@rename($temporary, $stateFile)) {
            throw new RuntimeException('Rate-limit counters cannot be saved');
        }
        $temporary = null;
        return ['allowed' => true, 'retry_after' => 0];
    } finally {
        if (is_string($temporary) && is_file($temporary)) @unlink($temporary);
        @flock($lock, LOCK_UN);
        fclose($lock);
    }
}
